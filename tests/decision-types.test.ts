import { describe, it, expect } from "vitest";
import {
  isGitSha,
  isGitBranchRef,
  scoreToConfidenceLevel,
  generateDecisionCommitId,
  generateConversationThreadId,
  generateDecisionTreeId,
  type GitSha,
  type GitBranchRef,
  type ConfidenceLevel,
  type DecisionType,
  type DecisionCommit,
  type DecisionTree,
  type ConversationThread,
  type ToolExecution,
  type CompactMessage,
} from "../src/protocol/decision-types.js";

describe("Git SHA Validation", () => {
  it("validates correct 40-character hex SHA", () => {
    expect(isGitSha("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2")).toBe(true);
    expect(isGitSha("0000000000000000000000000000000000000000")).toBe(true);
    expect(isGitSha("ffffffffffffffffffffffffffffffffffffffff")).toBe(true);
  });

  it("rejects invalid SHAs", () => {
    // Too short
    expect(isGitSha("a1b2c3d4")).toBe(false);
    // Too long
    expect(isGitSha("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3")).toBe(false);
    // Invalid characters
    expect(isGitSha("g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2")).toBe(false);
    // Uppercase (git uses lowercase)
    expect(isGitSha("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2")).toBe(false);
    // Empty
    expect(isGitSha("")).toBe(false);
  });
});

describe("Git Branch Ref Validation", () => {
  it("validates correct branch refs", () => {
    expect(isGitBranchRef("main")).toBe(true);
    expect(isGitBranchRef("feature/auth")).toBe(true);
    expect(isGitBranchRef("release-v1.0.0")).toBe(true);
    expect(isGitBranchRef("user_branch")).toBe(true);
    expect(isGitBranchRef("pvp/fork-oauth2")).toBe(true);
  });

  it("rejects invalid branch refs", () => {
    // Double dots not allowed
    expect(isGitBranchRef("main..develop")).toBe(false);
    // Empty
    expect(isGitBranchRef("")).toBe(false);
  });
});

describe("Confidence Level Scoring", () => {
  it("converts scores to confidence levels", () => {
    // Very low: 0.0-0.2
    expect(scoreToConfidenceLevel(0.0)).toBe("very_low");
    expect(scoreToConfidenceLevel(0.1)).toBe("very_low");
    expect(scoreToConfidenceLevel(0.19)).toBe("very_low");

    // Low: 0.2-0.4
    expect(scoreToConfidenceLevel(0.2)).toBe("low");
    expect(scoreToConfidenceLevel(0.3)).toBe("low");
    expect(scoreToConfidenceLevel(0.39)).toBe("low");

    // Medium: 0.4-0.6
    expect(scoreToConfidenceLevel(0.4)).toBe("medium");
    expect(scoreToConfidenceLevel(0.5)).toBe("medium");
    expect(scoreToConfidenceLevel(0.59)).toBe("medium");

    // High: 0.6-0.8
    expect(scoreToConfidenceLevel(0.6)).toBe("high");
    expect(scoreToConfidenceLevel(0.7)).toBe("high");
    expect(scoreToConfidenceLevel(0.79)).toBe("high");

    // Very high: 0.8-1.0
    expect(scoreToConfidenceLevel(0.8)).toBe("very_high");
    expect(scoreToConfidenceLevel(0.9)).toBe("very_high");
    expect(scoreToConfidenceLevel(1.0)).toBe("very_high");
  });

  it("handles edge cases", () => {
    expect(scoreToConfidenceLevel(0.199999)).toBe("very_low");
    expect(scoreToConfidenceLevel(0.2)).toBe("low");
    expect(scoreToConfidenceLevel(0.8)).toBe("very_high");
  });
});

describe("ID Generators", () => {
  describe("generateDecisionCommitId", () => {
    it("generates IDs with correct prefix", () => {
      const id = generateDecisionCommitId();
      expect(id.startsWith("dec_")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDecisionCommitId());
      }
      expect(ids.size).toBe(100);
    });

    it("generates IDs of reasonable length", () => {
      const id = generateDecisionCommitId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(30);
    });
  });

  describe("generateConversationThreadId", () => {
    it("generates IDs with correct prefix", () => {
      const id = generateConversationThreadId();
      expect(id.startsWith("thr_")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateConversationThreadId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("generateDecisionTreeId", () => {
    it("generates IDs with correct prefix", () => {
      const id = generateDecisionTreeId();
      expect(id.startsWith("tree_")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDecisionTreeId());
      }
      expect(ids.size).toBe(100);
    });
  });
});

describe("Type Definitions", () => {
  it("DecisionType enum includes all expected types", () => {
    const validTypes: DecisionType[] = [
      "implementation",
      "refactor",
      "bugfix",
      "exploration",
      "revert",
      "documentation",
      "test",
      "configuration",
      "dependency",
      "optimization",
    ];

    // TypeScript will catch if any of these are invalid
    expect(validTypes.length).toBe(10);
  });

  it("ConfidenceLevel enum includes all expected levels", () => {
    const validLevels: ConfidenceLevel[] = [
      "very_low",
      "low",
      "medium",
      "high",
      "very_high",
    ];

    expect(validLevels.length).toBe(5);
  });
});

describe("DecisionCommit Structure", () => {
  it("can create a valid DecisionCommit object", () => {
    const commit: DecisionCommit = {
      id: generateDecisionCommitId(),
      schema_version: 1,
      created_at: new Date().toISOString(),

      // Git linkage
      git_sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" as GitSha,
      git_branch: "main" as GitBranchRef,
      git_parents: [],
      git_author: {
        name: "Test User",
        email: "test@example.com",
        timestamp: new Date().toISOString(),
      },

      // PVP linkage
      pvp_session: "ses_abc123" as any,
      pvp_messages: ["msg-01", "msg-02"] as any[],
      initiating_prompt: "msg-01" as any,

      // Decision metadata
      decision_summary: "Implement JWT validation",
      decision_type: "implementation",

      // AI reasoning
      confidence_score: 0.85,
      confidence_level: "very_high",
      alternatives_considered: [
        {
          description: "Use OAuth2",
          reason_rejected: "Too complex for MVP",
        },
      ],

      // Tool executions
      tool_executions: [],

      // Files changed
      files_changed: [
        {
          path: "src/auth/jwt.ts",
          change_type: "added",
          additions: 50,
          deletions: 0,
          is_binary: false,
        },
      ],
    };

    expect(commit.id).toBeDefined();
    expect(commit.schema_version).toBe(1);
    expect(commit.confidence_score).toBe(0.85);
    expect(commit.decision_type).toBe("implementation");
  });
});

describe("ToolExecution Structure", () => {
  it("can create a valid ToolExecution object", () => {
    const execution: ToolExecution = {
      tool_proposal_ref: "msg-tool-01" as any,
      tool: "write_file",
      category: "write",
      input: "src/auth/jwt.ts",
      output_summary: "File written successfully",
      success: true,
      duration_ms: 150,
      required_approval: true,
      approved_by: ["human:alice" as any],
    };

    expect(execution.tool).toBe("write_file");
    expect(execution.success).toBe(true);
    expect(execution.required_approval).toBe(true);
  });
});

describe("CompactMessage Structure", () => {
  it("can create valid CompactMessage objects for different types", () => {
    const prompt: CompactMessage = {
      index: 0,
      pvp_id: "msg-01" as any,
      ts: new Date().toISOString(),
      sender: "human:alice" as any,
      type: "prompt",
      content: "Implement JWT validation",
    };

    const response: CompactMessage = {
      index: 1,
      pvp_id: "msg-02" as any,
      ts: new Date().toISOString(),
      sender: "ai:claude" as any,
      type: "response",
      content: "I'll implement JWT validation middleware...",
      reply_to: 0,
    };

    const tool: CompactMessage = {
      index: 2,
      pvp_id: "msg-03" as any,
      ts: new Date().toISOString(),
      sender: "ai:claude" as any,
      type: "tool",
      content: "write_file: src/auth/jwt.ts",
      tool_summary: {
        tool: "write_file",
        success: true,
        duration_ms: 150,
      },
    };

    expect(prompt.type).toBe("prompt");
    expect(response.type).toBe("response");
    expect(response.reply_to).toBe(0);
    expect(tool.tool_summary?.success).toBe(true);
  });
});

describe("ConversationThread Structure", () => {
  it("can create a valid ConversationThread object", () => {
    const thread: ConversationThread = {
      id: generateConversationThreadId(),
      schema_version: 1,
      decision_commit: generateDecisionCommitId(),
      git_sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2" as GitSha,
      messages: [
        {
          index: 0,
          pvp_id: "msg-01" as any,
          ts: new Date().toISOString(),
          sender: "human:alice" as any,
          type: "prompt",
          content: "Implement JWT validation",
        },
      ],
      participants: [
        {
          id: "human:alice" as any,
          name: "Alice",
          type: "human",
          message_count: 5,
        },
        {
          id: "ai:claude" as any,
          name: "Claude",
          type: "agent",
          message_count: 10,
        },
      ],
      metadata: {
        message_count: 15,
        human_messages: 5,
        agent_messages: 10,
        tool_executions: 3,
        duration_seconds: 120,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      },
      storage: {
        method: "git_notes",
        compressed: false,
        size_bytes: 1024,
        detail_level: "full",
      },
    };

    expect(thread.id.startsWith("thr_")).toBe(true);
    expect(thread.storage.method).toBe("git_notes");
    expect(thread.participants.length).toBe(2);
  });
});
