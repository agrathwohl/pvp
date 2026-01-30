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
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export type MonitorSourceType = "file" | "command" | "url";
export type StopConditionType = "duration" | "clock_time" | "auto_detect" | "manual";
export type MonitorSessionState = "pending" | "running" | "stopped" | "error";
export interface MonitorSource {
    type: MonitorSourceType;
    path?: string;
    command?: string;
    url?: string;
    label?: string;
}
export interface StopCondition {
    type: StopConditionType;
    duration_seconds?: number;
    stop_at?: string;
    idle_threshold_seconds?: number;
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
    is_new: boolean;
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
export interface MonitorToolHandler {
    /**
     * Create a proposal for starting process monitoring
     * Requires approval due to shell command execution and HTTP requests
     */
    proposeMonitor(input: ProcessMonitorInput, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    /**
     * Start the monitoring session after approval
     * Returns immediately, monitoring continues in background
     */
    executeMonitor(toolProposalId: MessageId, input: ProcessMonitorInput, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void, workingDir?: string): Promise<MonitorExecutionResult>;
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
export declare function createMonitorToolHandler(): MonitorToolHandler;
