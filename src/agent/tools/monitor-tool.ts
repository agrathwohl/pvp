/**
 * Process Monitor Tool Handler - PVP protocol integration for long-running process monitoring
 *
 * Provides periodic monitoring of data sources (files, commands, URLs) with:
 * - Configurable polling intervals
 * - Multiple data source aggregation
 * - Intelligent stopping conditions (duration, clock time, idle detection)
 * - Measurement tracking and insight generation
 * - Integration with notebook tool for visualizations
 * - Progressive context updates for real-time visibility
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createMessage } from "../../protocol/messages.js";
import { executeShellCommand, type ShellCommand } from "./shell-executor.js";
import type {
  SessionId,
  ParticipantId,
  MessageId,
  AnyMessage,
  RiskLevel,
} from "../../protocol/types.js";

// Configuration constants
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_IDLE_THRESHOLD_SECONDS = 60;
const MAX_MONITORING_DURATION = 24 * 60 * 60 * 1000; // 24 hours max
const COMMAND_TIMEOUT = 30_000; // 30 seconds per command execution
const URL_FETCH_TIMEOUT = 30_000; // 30 seconds for URL fetches
const MAX_DATA_PER_CYCLE = 1024 * 1024; // 1MB max per cycle per source

// ===========================================================================
// Type Definitions
// ===========================================================================

export type MonitorSourceType = "file" | "command" | "url";
export type StopConditionType = "duration" | "clock_time" | "auto_detect" | "manual";
export type MonitorSessionState = "pending" | "running" | "stopped" | "error";

export interface MonitorSource {
  type: MonitorSourceType;
  path?: string;      // For file type
  command?: string;   // For command type
  url?: string;       // For url type
  label?: string;     // Human-readable label
}

export interface StopCondition {
  type: StopConditionType;
  duration_seconds?: number;        // For duration type
  stop_at?: string;                 // For clock_time type (ISO string or HH:MM:SS)
  idle_threshold_seconds?: number;  // For auto_detect type
}

export interface ProcessMonitorInput {
  sources: MonitorSource[];
  interval_seconds?: number;
  stop_condition: StopCondition;
  analysis_prompt?: string;
  visualize?: boolean;
  output_dir?: string;
  session_name?: string;
}

export interface SourceDataPoint {
  timestamp: Date;
  source_label: string;
  source_type: MonitorSourceType;
  data: string;
  bytes: number;
  is_new: boolean;  // Whether this data is new since last cycle
}

export interface MonitorCycle {
  cycle_number: number;
  timestamp: Date;
  data_points: SourceDataPoint[];
  total_bytes: number;
  sources_with_new_data: number;
  analysis?: string;
}

export interface MonitorReport {
  session_name: string;
  start_time: Date;
  end_time: Date;
  total_cycles: number;
  total_data_points: number;
  total_bytes_collected: number;
  stop_reason: string;
  sources_summary: {
    label: string;
    type: MonitorSourceType;
    data_points: number;
    bytes: number;
    last_activity: Date | null;
  }[];
  insights: string[];
  data_file_path?: string;
  visualization_path?: string;
}

export interface MonitorExecutionResult {
  success: boolean;
  session_name: string;
  report?: MonitorReport;
  error?: string;
  execution_time_ms: number;
}

// Internal session state
interface MonitorSession {
  id: string;
  config: ProcessMonitorInput;
  state: MonitorSessionState;
  start_time: Date;
  cycles: MonitorCycle[];
  file_positions: Map<string, number>;  // Track read positions for files
  last_data_times: Map<string, Date>;   // Track when each source last had new data
  timer: ReturnType<typeof setTimeout> | null;
  stop_timer: ReturnType<typeof setTimeout> | null;
  broadcast: (msg: AnyMessage) => void;
  session_id: SessionId;
  agent_id: ParticipantId;
  working_dir: string;
  proposal_id: MessageId;
}

// ===========================================================================
// Handler Interface
// ===========================================================================

export interface MonitorToolHandler {
  /**
   * Create a proposal for starting process monitoring
   * Requires approval due to shell command execution and HTTP requests
   */
  proposeMonitor(
    input: ProcessMonitorInput,
    sessionId: SessionId,
    agentId: ParticipantId
  ): AnyMessage;

  /**
   * Start the monitoring session after approval
   * Returns immediately, monitoring continues in background
   */
  executeMonitor(
    toolProposalId: MessageId,
    input: ProcessMonitorInput,
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void,
    workingDir?: string
  ): Promise<MonitorExecutionResult>;

  /**
   * Manually stop an active monitoring session
   */
  stopMonitor(proposalId: MessageId): Promise<MonitorReport | null>;

  /**
   * Check if a monitoring session is active
   */
  isMonitoring(proposalId: MessageId): boolean;

  /**
   * Get current status of a monitoring session
   */
  getStatus(proposalId: MessageId): {
    state: MonitorSessionState;
    cycles: number;
    elapsed_seconds: number;
  } | null;
}

// ===========================================================================
// Utility Functions
// ===========================================================================

function getSourceLabel(source: MonitorSource, index: number): string {
  if (source.label) return source.label;
  switch (source.type) {
    case "file":
      return source.path ? path.basename(source.path) : `file_${index}`;
    case "command":
      return source.command?.slice(0, 20) || `command_${index}`;
    case "url":
      return source.url ? new URL(source.url).hostname : `url_${index}`;
    default:
      return `source_${index}`;
  }
}

function parseStopTime(stopAt: string): Date {
  // Try ISO format first
  const isoDate = new Date(stopAt);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try HH:MM:SS format (assumes today)
  const timeMatch = stopAt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(parseInt(timeMatch[1], 10));
    target.setMinutes(parseInt(timeMatch[2], 10));
    target.setSeconds(timeMatch[3] ? parseInt(timeMatch[3], 10) : 0);
    target.setMilliseconds(0);

    // If time is in the past, assume tomorrow
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  throw new Error(`Invalid stop_at format: ${stopAt}. Use ISO 8601 or HH:MM:SS`);
}

function calculateStopDelay(stopCondition: StopCondition): number | null {
  switch (stopCondition.type) {
    case "duration":
      if (stopCondition.duration_seconds) {
        return Math.min(
          stopCondition.duration_seconds * 1000,
          MAX_MONITORING_DURATION
        );
      }
      return null;

    case "clock_time":
      if (stopCondition.stop_at) {
        const targetTime = parseStopTime(stopCondition.stop_at);
        const delay = targetTime.getTime() - Date.now();
        if (delay <= 0) {
          throw new Error(`Stop time ${stopCondition.stop_at} is in the past`);
        }
        return Math.min(delay, MAX_MONITORING_DURATION);
      }
      return null;

    case "auto_detect":
    case "manual":
      return MAX_MONITORING_DURATION; // Will be stopped by idle detection or manual stop

    default:
      return null;
  }
}

async function collectFromFile(
  source: MonitorSource,
  filePositions: Map<string, number>,
  workingDir: string
): Promise<{ data: string; bytes: number; is_new: boolean }> {
  if (!source.path) {
    return { data: "", bytes: 0, is_new: false };
  }

  const filePath = path.isAbsolute(source.path)
    ? source.path
    : path.resolve(workingDir, source.path);

  try {
    const stat = await fs.stat(filePath);
    const currentPos = filePositions.get(filePath) || 0;

    if (stat.size <= currentPos) {
      // No new data
      return { data: "", bytes: 0, is_new: false };
    }

    // Read new data from last position
    const handle = await fs.open(filePath, "r");
    try {
      const bytesToRead = Math.min(stat.size - currentPos, MAX_DATA_PER_CYCLE);
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, currentPos);

      filePositions.set(filePath, currentPos + bytesToRead);
      const data = buffer.toString("utf-8");

      return { data, bytes: bytesToRead, is_new: true };
    } finally {
      await handle.close();
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return { data: `[Error reading file: ${errMsg}]`, bytes: 0, is_new: false };
  }
}

async function collectFromCommand(
  source: MonitorSource,
  workingDir: string
): Promise<{ data: string; bytes: number; is_new: boolean }> {
  if (!source.command) {
    return { data: "", bytes: 0, is_new: false };
  }

  try {
    const shellCmd: ShellCommand = {
      command: "sh",
      args: ["-c", source.command],
      category: "read",
      riskLevel: "medium",
      requiresApproval: false, // Already approved as part of monitor
      cwd: workingDir,
      timeout: COMMAND_TIMEOUT,
      maxBuffer: MAX_DATA_PER_CYCLE,
    };

    let stdout = "";
    let stderr = "";

    await executeShellCommand(
      shellCmd,
      {},
      {
        onStdout: (data: string) => { stdout += data; },
        onStderr: (data: string) => { stderr += data; },
        onExit: () => {},
        onError: () => {},
      }
    );

    const data = stdout + (stderr ? `\n[stderr]: ${stderr}` : "");
    return {
      data,
      bytes: Buffer.byteLength(data, "utf-8"),
      is_new: data.length > 0
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return { data: `[Error executing command: ${errMsg}]`, bytes: 0, is_new: false };
  }
}

async function collectFromUrl(
  source: MonitorSource
): Promise<{ data: string; bytes: number; is_new: boolean }> {
  if (!source.url) {
    return { data: "", bytes: 0, is_new: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT);

    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "PVP-Monitor/1.0",
          "Accept": "application/json, text/plain, */*",
        },
      });

      if (!response.ok) {
        return {
          data: `[HTTP ${response.status}: ${response.statusText}]`,
          bytes: 0,
          is_new: false
        };
      }

      const data = await response.text();
      return {
        data: data.slice(0, MAX_DATA_PER_CYCLE),
        bytes: Math.min(Buffer.byteLength(data, "utf-8"), MAX_DATA_PER_CYCLE),
        is_new: data.length > 0
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return { data: `[Error fetching URL: ${errMsg}]`, bytes: 0, is_new: false };
  }
}

function generateNotebookContent(
  session: MonitorSession,
  report: MonitorReport
): string {
  const cells = [
    // Title cell
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        `# Process Monitor Report: ${session.config.session_name || "Monitoring Session"}\n`,
        `\n`,
        `**Start Time:** ${report.start_time.toISOString()}\n`,
        `**End Time:** ${report.end_time.toISOString()}\n`,
        `**Total Cycles:** ${report.total_cycles}\n`,
        `**Stop Reason:** ${report.stop_reason}\n`,
      ],
    },
    // Setup cell
    {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [
        "import json\n",
        "import matplotlib.pyplot as plt\n",
        "from datetime import datetime\n",
        "import pandas as pd\n",
        "\n",
        "# Load monitoring data\n",
        `data = ${JSON.stringify(session.cycles.map(c => ({
          cycle: c.cycle_number,
          timestamp: c.timestamp.toISOString(),
          total_bytes: c.total_bytes,
          sources_with_new_data: c.sources_with_new_data,
          data_points: c.data_points.length,
        })), null, 2)}\n`,
        "\n",
        "df = pd.DataFrame(data)\n",
        "df['timestamp'] = pd.to_datetime(df['timestamp'])\n",
        "print(f'Loaded {len(df)} monitoring cycles')\n",
      ],
    },
    // Visualization cell
    {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [
        "# Data collection over time\n",
        "fig, axes = plt.subplots(2, 1, figsize=(12, 8))\n",
        "\n",
        "# Bytes collected per cycle\n",
        "axes[0].plot(df['cycle'], df['total_bytes'], marker='o', linewidth=2)\n",
        "axes[0].set_xlabel('Cycle')\n",
        "axes[0].set_ylabel('Bytes Collected')\n",
        "axes[0].set_title('Data Volume per Monitoring Cycle')\n",
        "axes[0].grid(True, alpha=0.3)\n",
        "\n",
        "# Active sources per cycle\n",
        "axes[1].bar(df['cycle'], df['sources_with_new_data'], color='steelblue', alpha=0.7)\n",
        "axes[1].set_xlabel('Cycle')\n",
        "axes[1].set_ylabel('Sources with New Data')\n",
        "axes[1].set_title('Active Data Sources per Cycle')\n",
        "axes[1].grid(True, alpha=0.3)\n",
        "\n",
        "plt.tight_layout()\n",
        "plt.show()\n",
      ],
    },
    // Summary cell
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        `## Source Summary\n`,
        `\n`,
        `| Source | Type | Data Points | Bytes | Last Activity |\n`,
        `|--------|------|-------------|-------|---------------|\n`,
        ...report.sources_summary.map(s =>
          `| ${s.label} | ${s.type} | ${s.data_points} | ${s.bytes} | ${s.last_activity?.toISOString() || "N/A"} |\n`
        ),
      ],
    },
    // Insights cell
    {
      cell_type: "markdown",
      metadata: {},
      source: [
        `## Insights\n`,
        `\n`,
        ...report.insights.map(i => `- ${i}\n`),
      ],
    },
  ];

  return JSON.stringify({
    cells,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
      language_info: {
        name: "python",
        version: "3.9.0",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 2);
}

function generateInsights(session: MonitorSession): string[] {
  const insights: string[] = [];
  const cycles = session.cycles;

  if (cycles.length === 0) {
    insights.push("No monitoring cycles completed");
    return insights;
  }

  // Calculate statistics
  const totalBytes = cycles.reduce((sum, c) => sum + c.total_bytes, 0);
  const avgBytesPerCycle = totalBytes / cycles.length;
  const maxBytes = Math.max(...cycles.map(c => c.total_bytes));
  const minBytes = Math.min(...cycles.map(c => c.total_bytes));

  insights.push(`Collected ${totalBytes.toLocaleString()} bytes across ${cycles.length} cycles`);
  insights.push(`Average data per cycle: ${Math.round(avgBytesPerCycle).toLocaleString()} bytes`);

  if (maxBytes > avgBytesPerCycle * 2) {
    insights.push(`Peak data volume was ${maxBytes.toLocaleString()} bytes - significant spike detected`);
  }

  // Detect patterns
  const lastQuarter = cycles.slice(-Math.ceil(cycles.length / 4));
  const firstQuarter = cycles.slice(0, Math.ceil(cycles.length / 4));

  const lastQuarterAvg = lastQuarter.reduce((s, c) => s + c.total_bytes, 0) / lastQuarter.length;
  const firstQuarterAvg = firstQuarter.reduce((s, c) => s + c.total_bytes, 0) / firstQuarter.length;

  if (lastQuarterAvg < firstQuarterAvg * 0.5) {
    insights.push("Data volume decreased significantly over time - sources may be becoming inactive");
  } else if (lastQuarterAvg > firstQuarterAvg * 1.5) {
    insights.push("Data volume increased over time - activity ramped up during monitoring");
  }

  // Check for idle sources
  const sourcesWithNoData = session.config.sources.filter(s => {
    const label = getSourceLabel(s, session.config.sources.indexOf(s));
    const lastTime = session.last_data_times.get(label);
    return !lastTime;
  });

  if (sourcesWithNoData.length > 0) {
    insights.push(`${sourcesWithNoData.length} source(s) produced no data during monitoring`);
  }

  return insights;
}

// ===========================================================================
// Handler Implementation
// ===========================================================================

export function createMonitorToolHandler(): MonitorToolHandler {
  const activeSessions = new Map<MessageId, MonitorSession>();

  async function runMonitoringCycle(session: MonitorSession): Promise<MonitorCycle> {
    const cycleNumber = session.cycles.length + 1;
    const dataPoints: SourceDataPoint[] = [];
    let totalBytes = 0;
    let sourcesWithNewData = 0;

    // Collect from all sources in parallel
    const collectionPromises = session.config.sources.map(async (source, index) => {
      const label = getSourceLabel(source, index);
      let result: { data: string; bytes: number; is_new: boolean };

      switch (source.type) {
        case "file":
          result = await collectFromFile(source, session.file_positions, session.working_dir);
          break;
        case "command":
          result = await collectFromCommand(source, session.working_dir);
          break;
        case "url":
          result = await collectFromUrl(source);
          break;
        default:
          result = { data: "", bytes: 0, is_new: false };
      }

      return { source, index, label, result };
    });

    const results = await Promise.all(collectionPromises);

    for (const { source, label, result } of results) {
      if (result.is_new) {
        session.last_data_times.set(label, new Date());
        sourcesWithNewData++;
      }

      totalBytes += result.bytes;

      dataPoints.push({
        timestamp: new Date(),
        source_label: label,
        source_type: source.type,
        data: result.data,
        bytes: result.bytes,
        is_new: result.is_new,
      });
    }

    const cycle: MonitorCycle = {
      cycle_number: cycleNumber,
      timestamp: new Date(),
      data_points: dataPoints,
      total_bytes: totalBytes,
      sources_with_new_data: sourcesWithNewData,
    };

    return cycle;
  }

  function checkIdleCondition(session: MonitorSession): boolean {
    if (session.config.stop_condition.type !== "auto_detect") {
      return false;
    }

    const threshold = (session.config.stop_condition.idle_threshold_seconds || DEFAULT_IDLE_THRESHOLD_SECONDS) * 1000;
    const now = Date.now();

    // Check if all sources have been idle beyond threshold
    for (const source of session.config.sources) {
      const label = getSourceLabel(source, session.config.sources.indexOf(source));
      const lastTime = session.last_data_times.get(label);

      if (lastTime && (now - lastTime.getTime()) < threshold) {
        return false; // At least one source is still active
      }
    }

    // All sources are idle (or never produced data)
    // Only return true if we've had at least one cycle
    return session.cycles.length > 0;
  }

  async function stopSession(session: MonitorSession, reason: string): Promise<MonitorReport> {
    session.state = "stopped";

    // Clear timers
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    if (session.stop_timer) {
      clearTimeout(session.stop_timer);
      session.stop_timer = null;
    }

    const endTime = new Date();
    const insights = generateInsights(session);

    // Build sources summary
    const sourcesSummary = session.config.sources.map((source, index) => {
      const label = getSourceLabel(source, index);
      const dataPoints = session.cycles.flatMap(c =>
        c.data_points.filter(dp => dp.source_label === label)
      );
      const totalBytes = dataPoints.reduce((sum, dp) => sum + dp.bytes, 0);
      const lastActivity = session.last_data_times.get(label) || null;

      return {
        label,
        type: source.type,
        data_points: dataPoints.length,
        bytes: totalBytes,
        last_activity: lastActivity,
      };
    });

    const report: MonitorReport = {
      session_name: session.config.session_name || `monitor_${session.id}`,
      start_time: session.start_time,
      end_time: endTime,
      total_cycles: session.cycles.length,
      total_data_points: session.cycles.reduce((sum, c) => sum + c.data_points.length, 0),
      total_bytes_collected: session.cycles.reduce((sum, c) => sum + c.total_bytes, 0),
      stop_reason: reason,
      sources_summary: sourcesSummary,
      insights,
    };

    // Save data file if output_dir specified
    if (session.config.output_dir) {
      try {
        const outputDir = path.isAbsolute(session.config.output_dir)
          ? session.config.output_dir
          : path.resolve(session.working_dir, session.config.output_dir);

        await fs.mkdir(outputDir, { recursive: true });

        // Save raw data
        const dataFilePath = path.join(outputDir, `monitor_data_${session.id}.json`);
        await fs.writeFile(dataFilePath, JSON.stringify({
          config: session.config,
          cycles: session.cycles,
          report,
        }, null, 2));
        report.data_file_path = dataFilePath;

        // Generate visualization notebook if requested
        if (session.config.visualize !== false) {
          const notebookPath = path.join(outputDir, `monitor_report_${session.id}.ipynb`);
          const notebookContent = generateNotebookContent(session, report);
          await fs.writeFile(notebookPath, notebookContent);
          report.visualization_path = notebookPath;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        insights.push(`Warning: Failed to save output files: ${errMsg}`);
      }
    }

    // Broadcast final report
    const completeMsg = createMessage("tool.output", session.session_id, session.agent_id, {
      tool_proposal: session.proposal_id,
      stream: "stdout" as const,
      text: `\n${"=".repeat(60)}\n` +
        `MONITORING COMPLETE\n` +
        `${"=".repeat(60)}\n` +
        `Stop Reason: ${reason}\n` +
        `Duration: ${Math.round((endTime.getTime() - session.start_time.getTime()) / 1000)}s\n` +
        `Total Cycles: ${report.total_cycles}\n` +
        `Total Data: ${report.total_bytes_collected.toLocaleString()} bytes\n` +
        `\nInsights:\n${insights.map(i => `  - ${i}`).join("\n")}\n` +
        (report.data_file_path ? `\nData saved to: ${report.data_file_path}\n` : "") +
        (report.visualization_path ? `Notebook saved to: ${report.visualization_path}\n` : ""),
      complete: true,
    });
    session.broadcast(completeMsg);

    // Send result
    const resultMsg = createMessage("tool.result", session.session_id, session.agent_id, {
      tool_proposal: session.proposal_id,
      success: true,
      result: report,
      duration_ms: endTime.getTime() - session.start_time.getTime(),
    });
    session.broadcast(resultMsg);

    // Emit context.add with the report
    const contextMsg = createMessage("context.add", session.session_id, session.agent_id, {
      key: `monitor:report:${session.id}`,
      content_type: "structured",
      content: report,
      source: "process_monitor",
      tags: ["monitor", "report", session.config.session_name || "unnamed"],
    });
    session.broadcast(contextMsg);

    // Clean up
    activeSessions.delete(session.proposal_id);

    return report;
  }

  async function scheduleCycle(session: MonitorSession): Promise<void> {
    if (session.state !== "running") {
      return;
    }

    try {
      // Run the monitoring cycle
      const cycle = await runMonitoringCycle(session);
      session.cycles.push(cycle);

      // Broadcast cycle results
      const cycleMsg = createMessage("tool.output", session.session_id, session.agent_id, {
        tool_proposal: session.proposal_id,
        stream: "stdout" as const,
        text: `[Cycle ${cycle.cycle_number}] ` +
          `${cycle.sources_with_new_data}/${session.config.sources.length} sources active, ` +
          `${cycle.total_bytes.toLocaleString()} bytes collected\n`,
        complete: false,
      });
      session.broadcast(cycleMsg);

      // Update context with latest cycle data
      const contextUpdateMsg = createMessage("context.update", session.session_id, session.agent_id, {
        key: `monitor:cycle:${session.id}`,
        new_content: {
          cycle_number: cycle.cycle_number,
          timestamp: cycle.timestamp.toISOString(),
          total_bytes: cycle.total_bytes,
          active_sources: cycle.sources_with_new_data,
        },
        reason: `Monitoring cycle ${cycle.cycle_number} completed`,
      });
      session.broadcast(contextUpdateMsg);

      // Check for idle condition
      if (checkIdleCondition(session)) {
        await stopSession(session, "All sources idle - no new data detected");
        return;
      }

      // Schedule next cycle
      session.timer = setTimeout(
        () => scheduleCycle(session),
        (session.config.interval_seconds || DEFAULT_INTERVAL_SECONDS) * 1000
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      session.state = "error";

      const errorMsg = createMessage("tool.output", session.session_id, session.agent_id, {
        tool_proposal: session.proposal_id,
        stream: "stderr" as const,
        text: `\nMonitoring error: ${errMsg}\n`,
        complete: true,
      });
      session.broadcast(errorMsg);

      const resultMsg = createMessage("tool.result", session.session_id, session.agent_id, {
        tool_proposal: session.proposal_id,
        success: false,
        error: errMsg,
        duration_ms: Date.now() - session.start_time.getTime(),
      });
      session.broadcast(resultMsg);

      activeSessions.delete(session.proposal_id);
    }
  }

  return {
    proposeMonitor(
      input: ProcessMonitorInput,
      sessionId: SessionId,
      agentId: ParticipantId
    ): AnyMessage {
      // Validate input
      if (!input.sources || input.sources.length === 0) {
        throw new Error("At least one data source is required");
      }

      for (const source of input.sources) {
        if (source.type === "file" && !source.path) {
          throw new Error("File source requires 'path' field");
        }
        if (source.type === "command" && !source.command) {
          throw new Error("Command source requires 'command' field");
        }
        if (source.type === "url" && !source.url) {
          throw new Error("URL source requires 'url' field");
        }
      }

      if (!input.stop_condition) {
        throw new Error("Stop condition is required");
      }

      const riskLevel: RiskLevel = "high"; // Contains shell execution and HTTP requests
      const description = `Monitor ${input.sources.length} source(s) ` +
        `every ${input.interval_seconds || DEFAULT_INTERVAL_SECONDS}s, ` +
        `stop: ${input.stop_condition.type}`;

      return createMessage("tool.propose", sessionId, agentId, {
        tool_name: "process_monitor",
        arguments: input as unknown as Record<string, unknown>,
        agent: agentId,
        risk_level: riskLevel,
        description,
        requires_approval: true,
        category: "shell_execute", // Due to command source type
      });
    },

    async executeMonitor(
      toolProposalId: MessageId,
      input: ProcessMonitorInput,
      sessionId: SessionId,
      agentId: ParticipantId,
      broadcast: (msg: AnyMessage) => void,
      workingDir?: string
    ): Promise<MonitorExecutionResult> {
      const startTime = Date.now();
      const effectiveWorkDir = workingDir || process.cwd();

      // Create session
      const session: MonitorSession = {
        id: toolProposalId,
        config: input,
        state: "running",
        start_time: new Date(),
        cycles: [],
        file_positions: new Map(),
        last_data_times: new Map(),
        timer: null,
        stop_timer: null,
        broadcast,
        session_id: sessionId,
        agent_id: agentId,
        working_dir: effectiveWorkDir,
        proposal_id: toolProposalId,
      };

      activeSessions.set(toolProposalId, session);

      // Broadcast start message
      const startMsg = createMessage("tool.output", sessionId, agentId, {
        tool_proposal: toolProposalId,
        stream: "stdout" as const,
        text: `${"=".repeat(60)}\n` +
          `PROCESS MONITOR STARTED\n` +
          `${"=".repeat(60)}\n` +
          `Session: ${input.session_name || toolProposalId}\n` +
          `Sources: ${input.sources.length}\n` +
          `Interval: ${input.interval_seconds || DEFAULT_INTERVAL_SECONDS}s\n` +
          `Stop Condition: ${input.stop_condition.type}\n` +
          `Working Directory: ${effectiveWorkDir}\n` +
          `${"=".repeat(60)}\n\n`,
        complete: false,
      });
      broadcast(startMsg);

      // Add context for monitoring session
      const contextMsg = createMessage("context.add", sessionId, agentId, {
        key: `monitor:session:${toolProposalId}`,
        content_type: "structured",
        content: {
          session_id: toolProposalId,
          start_time: session.start_time.toISOString(),
          sources: input.sources.map((s, i) => ({
            label: getSourceLabel(s, i),
            type: s.type,
          })),
          interval_seconds: input.interval_seconds || DEFAULT_INTERVAL_SECONDS,
          stop_condition: input.stop_condition,
        },
        source: "process_monitor",
        tags: ["monitor", "session", "active"],
      });
      broadcast(contextMsg);

      // Calculate and set stop timer
      try {
        const stopDelay = calculateStopDelay(input.stop_condition);
        if (stopDelay) {
          session.stop_timer = setTimeout(async () => {
            if (session.state === "running") {
              await stopSession(session, `Stop condition reached: ${input.stop_condition.type}`);
            }
          }, stopDelay);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Invalid stop condition";
        session.state = "error";
        activeSessions.delete(toolProposalId);

        return {
          success: false,
          session_name: input.session_name || toolProposalId,
          error: errMsg,
          execution_time_ms: Date.now() - startTime,
        };
      }

      // Send immediate tool.result to complete the batch
      // (Monitoring continues in background - this is a long-running operation)
      const startResultMsg = createMessage("tool.result", sessionId, agentId, {
        tool_proposal: toolProposalId,
        success: true,
        result: {
          status: "monitoring_started",
          session_name: input.session_name || toolProposalId,
          sources: input.sources.length,
          interval_seconds: input.interval_seconds || DEFAULT_INTERVAL_SECONDS,
          stop_condition: input.stop_condition.type,
          message: `Process monitoring started. Will collect data every ${input.interval_seconds || DEFAULT_INTERVAL_SECONDS}s. ` +
            `Stop condition: ${input.stop_condition.type}. ` +
            `Watch for context updates with key 'monitor:cycle:${toolProposalId}' for progress.`,
        },
        duration_ms: Date.now() - startTime,
      });
      broadcast(startResultMsg);

      // Start monitoring cycles
      // Run first cycle immediately, then schedule subsequent cycles
      scheduleCycle(session);

      // Return immediately - monitoring continues in background
      return {
        success: true,
        session_name: input.session_name || toolProposalId,
        execution_time_ms: Date.now() - startTime,
      };
    },

    async stopMonitor(proposalId: MessageId): Promise<MonitorReport | null> {
      const session = activeSessions.get(proposalId);
      if (!session || session.state !== "running") {
        return null;
      }

      return await stopSession(session, "Manual stop requested");
    },

    isMonitoring(proposalId: MessageId): boolean {
      const session = activeSessions.get(proposalId);
      return session?.state === "running";
    },

    getStatus(proposalId: MessageId) {
      const session = activeSessions.get(proposalId);
      if (!session) return null;

      return {
        state: session.state,
        cycles: session.cycles.length,
        elapsed_seconds: Math.round((Date.now() - session.start_time.getTime()) / 1000),
      };
    },
  };
}
