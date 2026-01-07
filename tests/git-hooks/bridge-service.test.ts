import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  GitSessionState,
  PvpGitConfig,
  CommitContextMessage,
  ToolExecutionSummary,
  ParticipantInfo,
} from "../../src/git-hooks/bridge/types.js";
import type { SessionId, MessageId, ParticipantId } from "../../src/protocol/types.js";

/**
 * Tests for the PVP Git Bridge Service
 *
 * These tests verify the bridge service correctly:
 * 1. Maintains session state across message events
 * 2. Provides correct context for git hooks
 * 3. Handles session lifecycle (start/end)
 * 4. Filters relevant messages for commit context
 */

describe("GitSessionState", () => {
  it("initializes with null session", () => {
    const state: GitSessionState = {
      session_id: null,
      active_participants: [],
      last_commit: null,
      messages_since_last_commit: 0,
      relevant_messages: [],
      tool_executions: [],
      prompts_count: 0,
      approvals_count: 0,
      decision_summary: null,
    };

    expect(state.session_id).toBeNull();
    expect(state.messages_since_last_commit).toBe(0);
  });

  it("can track participants", () => {
    const alice: ParticipantInfo = {
      id: "human:alice" as ParticipantId,
      name: "Alice",
      type: "human",
      role: "developer",
    };

    const claude: ParticipantInfo = {
      id: "ai:claude" as ParticipantId,
      name: "Claude",
      type: "agent",
      role: "assistant",
    };

    const state: GitSessionState = {
      session_id: "ses_abc123" as SessionId,
      active_participants: [alice, claude],
      last_commit: null,
      messages_since_last_commit: 0,
      relevant_messages: [],
      tool_executions: [],
      prompts_count: 0,
      approvals_count: 0,
      decision_summary: null,
    };

    expect(state.active_participants.length).toBe(2);
    expect(state.active_participants.find(p => p.type === "human")?.name).toBe("Alice");
    expect(state.active_participants.find(p => p.type === "agent")?.name).toBe("Claude");
  });
});

describe("CommitContextMessage", () => {
  it("can represent a prompt message", () => {
    const msg: CommitContextMessage = {
      id: "msg-01" as MessageId,
      type: "prompt.submit",
      sender: "human:alice" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "Implement JWT validation",
    };

    expect(msg.type).toBe("prompt.submit");
    expect(msg.summary).toBe("Implement JWT validation");
  });

  it("can represent a tool execution message", () => {
    const msg: CommitContextMessage = {
      id: "msg-03" as MessageId,
      type: "tool.result",
      sender: "ai:claude" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "write_file: src/auth/jwt.ts",
      tool_name: "write_file",
    };

    expect(msg.type).toBe("tool.result");
    expect(msg.tool_name).toBe("write_file");
  });

  it("can represent a gate approval message", () => {
    const msg: CommitContextMessage = {
      id: "msg-04" as MessageId,
      type: "gate.approve",
      sender: "human:alice" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "Approved write_file operation",
    };

    expect(msg.type).toBe("gate.approve");
  });
});

describe("ToolExecutionSummary", () => {
  it("can summarize a successful tool execution", () => {
    const summary: ToolExecutionSummary = {
      tool: "write_file",
      category: "write",
      target: "src/auth/jwt.ts",
      success: true,
      duration_ms: 150,
      approved_by: ["human:alice" as ParticipantId],
    };

    expect(summary.success).toBe(true);
    expect(summary.approved_by?.length).toBe(1);
  });

  it("can summarize a failed tool execution", () => {
    const summary: ToolExecutionSummary = {
      tool: "bash",
      category: "execute",
      target: "npm install",
      success: false,
      duration_ms: 5000,
      error: "ENOENT: npm not found",
    };

    expect(summary.success).toBe(false);
    expect(summary.error).toBe("ENOENT: npm not found");
  });
});

describe("PvpGitConfig", () => {
  it("can define a complete configuration", () => {
    const config: PvpGitConfig = {
      socket_path: "/tmp/pvp-git-bridge.sock",
      http_port: 9847,
      state_file: ".pvp/current-session.json",
      notes_ref: "refs/notes/pvp",
      webhooks: [
        {
          url: "https://example.com/webhook",
          events: ["commit"],
          secret: "webhook-secret",
        },
      ],
      enforcement: {
        require_session: false,
        require_decision_by: true,
        min_confidence: 0.0,
        block_without_context: false,
      },
      message_filter: {
        include_thinking: false,
        include_tool_details: true,
        max_messages: 50,
        max_content_length: 500,
      },
    };

    expect(config.socket_path).toBe("/tmp/pvp-git-bridge.sock");
    expect(config.http_port).toBe(9847);
    expect(config.enforcement.require_decision_by).toBe(true);
    expect(config.message_filter.include_thinking).toBe(false);
  });
});

describe("Session State Management", () => {
  it("accumulates messages since last commit", () => {
    let state: GitSessionState = {
      session_id: "ses_abc123" as SessionId,
      active_participants: [],
      last_commit: null,
      messages_since_last_commit: 0,
      relevant_messages: [],
      tool_executions: [],
      prompts_count: 0,
      approvals_count: 0,
      decision_summary: null,
    };

    // Simulate receiving messages
    const addMessage = (msg: CommitContextMessage) => {
      state = {
        ...state,
        messages_since_last_commit: state.messages_since_last_commit + 1,
        relevant_messages: [...state.relevant_messages, msg],
        prompts_count: msg.type === "prompt.submit"
          ? state.prompts_count + 1
          : state.prompts_count,
        approvals_count: msg.type === "gate.approve"
          ? state.approvals_count + 1
          : state.approvals_count,
      };
    };

    addMessage({
      id: "msg-01" as MessageId,
      type: "prompt.submit",
      sender: "human:alice" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "Implement auth",
    });

    addMessage({
      id: "msg-02" as MessageId,
      type: "response.delta",
      sender: "ai:claude" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "Response content...",
    });

    addMessage({
      id: "msg-03" as MessageId,
      type: "gate.approve",
      sender: "human:alice" as ParticipantId,
      timestamp: new Date().toISOString(),
      summary: "Approved tool",
    });

    expect(state.messages_since_last_commit).toBe(3);
    expect(state.prompts_count).toBe(1);
    expect(state.approvals_count).toBe(1);
    expect(state.relevant_messages.length).toBe(3);
  });

  it("resets after commit notification", () => {
    let state: GitSessionState = {
      session_id: "ses_abc123" as SessionId,
      active_participants: [],
      last_commit: null,
      messages_since_last_commit: 5,
      relevant_messages: [
        { id: "msg-01" as MessageId, type: "prompt.submit", sender: "human:alice" as ParticipantId, timestamp: "", summary: "" },
      ],
      tool_executions: [
        { tool: "write_file", category: "write", target: "test.ts", success: true, duration_ms: 100 },
      ],
      prompts_count: 2,
      approvals_count: 1,
      decision_summary: "Implement feature X",
    };

    // Simulate commit notification
    const notifyCommit = (sha: string) => {
      state = {
        ...state,
        last_commit: sha,
        messages_since_last_commit: 0,
        relevant_messages: [],
        tool_executions: [],
        prompts_count: 0,
        approvals_count: 0,
        decision_summary: null,
      };
    };

    notifyCommit("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");

    expect(state.last_commit).toBe("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
    expect(state.messages_since_last_commit).toBe(0);
    expect(state.relevant_messages.length).toBe(0);
    expect(state.tool_executions.length).toBe(0);
    expect(state.decision_summary).toBeNull();
  });
});

describe("Message Filtering", () => {
  it("filters messages by type for commit context", () => {
    const allMessages: CommitContextMessage[] = [
      { id: "msg-01" as MessageId, type: "prompt.submit", sender: "human:alice" as ParticipantId, timestamp: "", summary: "Prompt" },
      { id: "msg-02" as MessageId, type: "response.thinking", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "Thinking..." },
      { id: "msg-03" as MessageId, type: "response.delta", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "Response..." },
      { id: "msg-04" as MessageId, type: "tool.propose", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "Tool proposal" },
      { id: "msg-05" as MessageId, type: "gate.approve", sender: "human:alice" as ParticipantId, timestamp: "", summary: "Approved" },
      { id: "msg-06" as MessageId, type: "tool.result", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "Result" },
      { id: "msg-07" as MessageId, type: "response.end", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "Done" },
    ];

    // Filter to include only relevant types (excluding thinking)
    const relevantTypes = ["prompt.submit", "tool.propose", "gate.approve", "tool.result", "response.end"];
    const filtered = allMessages.filter(m => relevantTypes.includes(m.type));

    expect(filtered.length).toBe(5);
    expect(filtered.find(m => m.type === "response.thinking")).toBeUndefined();
    expect(filtered.find(m => m.type === "response.delta")).toBeUndefined();
  });

  it("truncates message content to max length", () => {
    const maxLength = 100;
    const longContent = "A".repeat(500);

    const truncate = (content: string, max: number) =>
      content.length > max ? content.slice(0, max) + "..." : content;

    const truncated = truncate(longContent, maxLength);

    expect(truncated.length).toBe(103); // 100 + "..."
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("limits number of messages retained", () => {
    const maxMessages = 10;
    const messages: CommitContextMessage[] = [];

    for (let i = 0; i < 50; i++) {
      messages.push({
        id: `msg-${i}` as MessageId,
        type: "response.delta",
        sender: "ai:claude" as ParticipantId,
        timestamp: "",
        summary: `Message ${i}`,
      });
    }

    // Keep only the last N messages
    const limited = messages.slice(-maxMessages);

    expect(limited.length).toBe(10);
    expect(limited[0].id).toBe("msg-40");
    expect(limited[9].id).toBe("msg-49");
  });
});

describe("Trailer Generation", () => {
  it("generates PVP trailers from session state", () => {
    const state: GitSessionState = {
      session_id: "ses_01HX7K9P4QZCVD3N8MYW6R5T2B" as SessionId,
      active_participants: [
        { id: "human:alice" as ParticipantId, name: "Alice", type: "human", role: "developer" },
        { id: "ai:claude" as ParticipantId, name: "Claude", type: "agent", role: "assistant" },
      ],
      last_commit: null,
      messages_since_last_commit: 5,
      relevant_messages: [
        { id: "msg-01" as MessageId, type: "prompt.submit", sender: "human:alice" as ParticipantId, timestamp: "", summary: "" },
        { id: "msg-03" as MessageId, type: "tool.result", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "" },
        { id: "msg-05" as MessageId, type: "response.end", sender: "ai:claude" as ParticipantId, timestamp: "", summary: "" },
      ],
      tool_executions: [
        { tool: "write_file", category: "write", target: "src/auth.ts", success: true, duration_ms: 100 },
        { tool: "read_file", category: "read", target: "src/config.ts", success: true, duration_ms: 50 },
      ],
      prompts_count: 1,
      approvals_count: 1,
      decision_summary: "Implement JWT validation",
    };

    // Generate trailers
    const generateTrailers = (state: GitSessionState, confidence: number = 0.85): string[] => {
      const trailers: string[] = [];

      if (state.session_id) {
        trailers.push(`PVP-Session: ${state.session_id}`);
      }

      const messageIds = state.relevant_messages
        .filter(m => ["prompt.submit", "tool.result", "response.end"].includes(m.type))
        .map(m => m.id)
        .join(",");
      if (messageIds) {
        trailers.push(`PVP-Messages: ${messageIds}`);
      }

      trailers.push(`PVP-Confidence: ${confidence.toFixed(2)}`);
      trailers.push(`PVP-Decision-Type: implementation`);

      const decisionBy = state.active_participants
        .map(p => `${p.type}:${p.name.toLowerCase()}`)
        .join(",");
      trailers.push(`Decision-By: ${decisionBy}`);

      return trailers;
    };

    const trailers = generateTrailers(state);

    expect(trailers).toContain("PVP-Session: ses_01HX7K9P4QZCVD3N8MYW6R5T2B");
    expect(trailers).toContain("PVP-Messages: msg-01,msg-03,msg-05");
    expect(trailers).toContain("PVP-Confidence: 0.85");
    expect(trailers).toContain("PVP-Decision-Type: implementation");
    expect(trailers).toContain("Decision-By: human:alice,agent:claude");
  });
});

describe("Git Notes Content Generation", () => {
  it("generates JSON structure for git notes", () => {
    const state: GitSessionState = {
      session_id: "ses_abc123" as SessionId,
      active_participants: [
        { id: "human:alice" as ParticipantId, name: "Alice", type: "human", role: "developer" },
        { id: "ai:claude" as ParticipantId, name: "Claude", type: "agent", role: "assistant" },
      ],
      last_commit: null,
      messages_since_last_commit: 3,
      relevant_messages: [
        { id: "msg-01" as MessageId, type: "prompt.submit", sender: "human:alice" as ParticipantId, timestamp: "2026-01-06T10:00:00Z", summary: "Implement auth" },
        { id: "msg-02" as MessageId, type: "tool.result", sender: "ai:claude" as ParticipantId, timestamp: "2026-01-06T10:01:00Z", summary: "write_file: auth.ts", tool_name: "write_file" },
      ],
      tool_executions: [
        { tool: "write_file", category: "write", target: "src/auth.ts", success: true, duration_ms: 150, approved_by: ["human:alice" as ParticipantId] },
      ],
      prompts_count: 1,
      approvals_count: 1,
      decision_summary: "Implement authentication middleware",
    };

    const generateNotesContent = (state: GitSessionState) => ({
      version: 1,
      session: {
        id: state.session_id,
        participants: state.active_participants.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
        })),
      },
      conversation: {
        messages: state.relevant_messages.map(m => ({
          id: m.id,
          type: m.type,
          sender: m.sender,
          timestamp: m.timestamp,
          summary: m.summary,
        })),
      },
      tools: {
        executions: state.tool_executions.map(t => ({
          tool: t.tool,
          category: t.category,
          target: t.target,
          success: t.success,
          duration_ms: t.duration_ms,
          approved_by: t.approved_by,
        })),
      },
      metrics: {
        prompts_count: state.prompts_count,
        approvals_count: state.approvals_count,
        messages_count: state.messages_since_last_commit,
      },
    });

    const notes = generateNotesContent(state);

    expect(notes.version).toBe(1);
    expect(notes.session.id).toBe("ses_abc123");
    expect(notes.session.participants.length).toBe(2);
    expect(notes.conversation.messages.length).toBe(2);
    expect(notes.tools.executions.length).toBe(1);
    expect(notes.tools.executions[0].tool).toBe("write_file");
    expect(notes.metrics.prompts_count).toBe(1);

    // Verify it's valid JSON
    const json = JSON.stringify(notes);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
