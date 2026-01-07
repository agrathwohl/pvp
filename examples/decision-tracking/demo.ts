#!/usr/bin/env tsx
/**
 * PVP Decision Tracking Protocol - Working Example
 *
 * This example demonstrates the complete flow of:
 * 1. Creating a PVP session with participants
 * 2. Simulating a vibecoding conversation
 * 3. Generating decision commit metadata
 * 4. Creating git trailers and notes content
 *
 * Run with: npx tsx examples/decision-tracking/demo.ts
 */

import {
  type DecisionCommit,
  type DecisionTree,
  type ConversationThread,
  type ToolExecution,
  type CompactMessage,
  type GitSha,
  type GitBranchRef,
  generateDecisionCommitId,
  generateConversationThreadId,
  generateDecisionTreeId,
  scoreToConfidenceLevel,
  isGitSha,
} from "../../src/protocol/decision-types.js";

import type {
  SessionId,
  MessageId,
  ParticipantId,
} from "../../src/protocol/types.js";

// =============================================================================
// STEP 1: Simulate PVP Session
// =============================================================================

console.log("\n" + "=".repeat(60));
console.log("PVP DECISION TRACKING PROTOCOL - DEMONSTRATION");
console.log("=".repeat(60) + "\n");

// Session setup
const sessionId = "ses_01HX7K9P4QZCVD3N8MYW6R5T2B" as SessionId;
const humanParticipant = "human:alice" as ParticipantId;
const aiParticipant = "ai:claude" as ParticipantId;

console.log("📋 Session Started");
console.log(`   Session ID: ${sessionId}`);
console.log(`   Participants: Alice (human), Claude (AI)`);
console.log("");

// =============================================================================
// STEP 2: Simulate Conversation Flow
// =============================================================================

console.log("💬 Simulating Vibecoding Conversation...\n");

const messages: CompactMessage[] = [
  {
    index: 0,
    pvp_id: "msg-01" as MessageId,
    ts: new Date().toISOString(),
    sender: humanParticipant,
    type: "prompt",
    content: "Implement JWT validation middleware for our WebSocket transport",
  },
  {
    index: 1,
    pvp_id: "msg-02" as MessageId,
    ts: new Date().toISOString(),
    sender: aiParticipant,
    type: "thinking",
    content: "Analyzing authentication requirements and considering implementation approaches...",
  },
  {
    index: 2,
    pvp_id: "msg-03" as MessageId,
    ts: new Date().toISOString(),
    sender: aiParticipant,
    type: "response",
    content: "I'll implement JWT validation that validates tokens on connection upgrade. This approach provides early feedback and reduces load on the session manager.",
  },
  {
    index: 3,
    pvp_id: "msg-04" as MessageId,
    ts: new Date().toISOString(),
    sender: aiParticipant,
    type: "tool",
    content: "write_file: src/auth/jwt-middleware.ts",
    tool_summary: {
      tool: "write_file",
      success: true,
      duration_ms: 150,
    },
  },
  {
    index: 4,
    pvp_id: "msg-05" as MessageId,
    ts: new Date().toISOString(),
    sender: humanParticipant,
    type: "approval",
    content: "Approved write_file operation",
  },
  {
    index: 5,
    pvp_id: "msg-06" as MessageId,
    ts: new Date().toISOString(),
    sender: aiParticipant,
    type: "tool",
    content: "write_file: src/auth/jwt-utils.ts",
    tool_summary: {
      tool: "write_file",
      success: true,
      duration_ms: 120,
    },
  },
  {
    index: 6,
    pvp_id: "msg-07" as MessageId,
    ts: new Date().toISOString(),
    sender: humanParticipant,
    type: "approval",
    content: "Approved write_file operation",
  },
  {
    index: 7,
    pvp_id: "msg-08" as MessageId,
    ts: new Date().toISOString(),
    sender: aiParticipant,
    type: "response",
    content: "JWT validation middleware is complete. The implementation validates tokens on WebSocket upgrade, extracts claims, and attaches them to the connection context.",
  },
];

// Display conversation
for (const msg of messages) {
  const icon = msg.type === "prompt" ? "👤" :
               msg.type === "approval" ? "✅" :
               msg.type === "tool" ? "🔧" :
               msg.type === "thinking" ? "🤔" : "🤖";
  const sender = msg.sender.includes("human") ? "Alice" : "Claude";
  console.log(`${icon} [${msg.type}] ${sender}: ${msg.content.slice(0, 60)}${msg.content.length > 60 ? "..." : ""}`);
}

// =============================================================================
// STEP 3: Create Tool Execution Records
// =============================================================================

console.log("\n📦 Tool Executions Captured:\n");

const toolExecutions: ToolExecution[] = [
  {
    tool_proposal_ref: "msg-04" as MessageId,
    tool: "write_file",
    category: "write",
    input: "src/auth/jwt-middleware.ts",
    output_summary: "Created JWT validation middleware (85 lines)",
    success: true,
    duration_ms: 150,
    required_approval: true,
    approved_by: [humanParticipant],
  },
  {
    tool_proposal_ref: "msg-06" as MessageId,
    tool: "write_file",
    category: "write",
    input: "src/auth/jwt-utils.ts",
    output_summary: "Created JWT utility functions (42 lines)",
    success: true,
    duration_ms: 120,
    required_approval: true,
    approved_by: [humanParticipant],
  },
];

for (const exec of toolExecutions) {
  console.log(`   ${exec.success ? "✅" : "❌"} ${exec.tool}: ${exec.input}`);
  console.log(`      Duration: ${exec.duration_ms}ms | Approved: ${exec.approved_by?.join(", ")}`);
}

// =============================================================================
// STEP 4: Generate Decision Commit
// =============================================================================

console.log("\n" + "-".repeat(60));
console.log("📝 GENERATING DECISION COMMIT");
console.log("-".repeat(60) + "\n");

const gitSha = "a1b2c3d4e5f6789012345678901234567890abcd" as GitSha;
const confidenceScore = 0.90;

const decisionCommit: DecisionCommit = {
  id: generateDecisionCommitId(),
  schema_version: 1,
  created_at: new Date().toISOString(),

  // Git linkage
  git_sha: gitSha,
  git_branch: "main" as GitBranchRef,
  git_parents: [],
  git_author: {
    name: "Alice",
    email: "alice@example.com",
    timestamp: new Date().toISOString(),
  },

  // PVP linkage
  pvp_session: sessionId,
  pvp_messages: messages.map(m => m.pvp_id),
  initiating_prompt: "msg-01" as MessageId,
  concluding_response: "msg-08" as MessageId,

  // Decision metadata
  decision_summary: "Implement JWT validation middleware for WebSocket transport",
  decision_rationale: "JWT validation on connection upgrade provides early feedback and reduces session manager load",
  decision_type: "implementation",
  tags: ["auth", "jwt", "websocket", "middleware"],

  // AI reasoning
  confidence_score: confidenceScore,
  confidence_level: scoreToConfidenceLevel(confidenceScore),
  confidence_factors: [
    { factor: "team_consensus", impact: "positive", weight: 0.2, explanation: "Discussed and agreed in session" },
    { factor: "tested_pattern", impact: "positive", weight: 0.2, explanation: "JWT is well-established" },
    { factor: "reversible", impact: "positive", weight: 0.1, explanation: "Can easily swap auth method" },
  ],
  alternatives_considered: [
    {
      description: "Validate in session manager",
      reason_rejected: "Late error feedback, increased session manager complexity",
      trade_offs: ["Simpler middleware", "Delayed auth errors"],
    },
    {
      description: "Use OAuth2 with external provider",
      reason_rejected: "Too complex for MVP, adds external dependency",
      confidence_if_chosen: 0.7,
      trade_offs: ["More features", "External dependency", "Higher complexity"],
    },
  ],
  assumptions: [
    {
      assumption: "JWT tokens will be passed in Authorization header",
      validation_status: "validated",
      validation_method: "Confirmed with team",
    },
    {
      assumption: "Token refresh is handled client-side",
      validation_status: "unvalidated",
      impact_if_wrong: "May need server-side refresh endpoint",
    },
  ],
  risks: [
    {
      description: "Token expiry during long sessions",
      severity: "medium",
      likelihood: "possible",
      mitigation: "Implement refresh mechanism in v2",
    },
  ],

  // Tool executions
  tool_executions: toolExecutions,
  tool_stats: {
    total_executions: 2,
    successful_executions: 2,
    failed_executions: 0,
    total_duration_ms: 270,
    tools_used: ["write_file"],
    categories_used: ["write"],
    approvals_requested: 2,
    approvals_granted: 2,
  },

  // Validation
  approvals: [
    { approver: humanParticipant, approved_at: new Date().toISOString(), comment: "LGTM" },
  ],
  files_changed: [
    { path: "src/auth/jwt-middleware.ts", change_type: "added", additions: 85, deletions: 0, is_binary: false },
    { path: "src/auth/jwt-utils.ts", change_type: "added", additions: 42, deletions: 0, is_binary: false },
  ],
};

console.log(`Decision ID: ${decisionCommit.id}`);
console.log(`Git SHA: ${decisionCommit.git_sha}`);
console.log(`Decision Type: ${decisionCommit.decision_type}`);
console.log(`Confidence: ${decisionCommit.confidence_score} (${decisionCommit.confidence_level})`);
console.log(`Alternatives Considered: ${decisionCommit.alternatives_considered.length}`);
console.log(`Files Changed: ${decisionCommit.files_changed.length}`);

// =============================================================================
// STEP 5: Generate Git Commit Message
// =============================================================================

console.log("\n" + "-".repeat(60));
console.log("📄 GENERATED COMMIT MESSAGE");
console.log("-".repeat(60) + "\n");

const generateCommitMessage = (commit: DecisionCommit): string => {
  const header = `feat(auth): implement JWT validation middleware [pvp:msg-01]`;

  const body = `${commit.decision_summary}

${commit.decision_rationale}

Alternatives considered:
${commit.alternatives_considered.map(a => `- ${a.description}: ${a.reason_rejected}`).join("\n")}

Confidence: ${commit.confidence_level} (${commit.confidence_score.toFixed(2)})`;

  const trailers = [
    `PVP-Session: ${commit.pvp_session}`,
    `PVP-Messages: ${commit.pvp_messages.slice(0, 5).join(",")}`,
    `PVP-Confidence: ${commit.confidence_score.toFixed(2)}`,
    `PVP-Decision-Type: ${commit.decision_type}`,
    `Decision-By: ${humanParticipant},${aiParticipant}`,
    `Approved-By: ${humanParticipant}`,
  ].join("\n");

  return `${header}\n\n${body}\n\n${trailers}`;
};

const commitMessage = generateCommitMessage(decisionCommit);
console.log(commitMessage);

// =============================================================================
// STEP 6: Generate Git Notes Content
// =============================================================================

console.log("\n" + "-".repeat(60));
console.log("📋 GENERATED GIT NOTES (JSON)");
console.log("-".repeat(60) + "\n");

const generateGitNotes = (commit: DecisionCommit, messages: CompactMessage[]) => ({
  version: 1,
  schema: "pvp-decision-tracking/1.0",
  session: {
    id: commit.pvp_session,
    participants: [
      { id: humanParticipant, name: "Alice", type: "human" },
      { id: aiParticipant, name: "Claude", type: "agent" },
    ],
  },
  conversation: {
    thread_id: generateConversationThreadId(),
    message_count: messages.length,
    messages: messages.filter(m => m.type !== "thinking").map(m => ({
      id: m.pvp_id,
      type: m.type,
      sender: m.sender,
      timestamp: m.ts,
      content: m.content.slice(0, 200),
    })),
  },
  tools: {
    executions: commit.tool_executions.map(t => ({
      tool: t.tool,
      target: t.input,
      success: t.success,
      duration_ms: t.duration_ms,
      approved_by: t.approved_by,
    })),
    stats: commit.tool_stats,
  },
  decision: {
    type: commit.decision_type,
    confidence: commit.confidence_score,
    confidence_level: commit.confidence_level,
    factors: commit.confidence_factors,
    alternatives: commit.alternatives_considered,
    assumptions: commit.assumptions,
    risks: commit.risks,
  },
  metrics: {
    total_messages: messages.length,
    human_messages: messages.filter(m => m.sender.includes("human")).length,
    agent_messages: messages.filter(m => m.sender.includes("ai")).length,
    tool_executions: commit.tool_stats?.total_executions ?? 0,
    approvals: commit.approvals?.length ?? 0,
  },
});

const gitNotes = generateGitNotes(decisionCommit, messages);
console.log(JSON.stringify(gitNotes, null, 2));

// =============================================================================
// STEP 7: Generate Shell Commands
// =============================================================================

console.log("\n" + "-".repeat(60));
console.log("🖥️  SHELL COMMANDS TO EXECUTE");
console.log("-".repeat(60) + "\n");

console.log("# Create commit with PVP trailers:");
console.log(`git commit -m "$(cat <<'EOF'`);
console.log(commitMessage);
console.log(`EOF
)"`);

console.log("\n# Attach git notes with decision context:");
console.log(`git notes --ref=pvp add -m '${JSON.stringify(gitNotes).replace(/'/g, "'\\''")}' HEAD`);

console.log("\n# Push with PVP metadata:");
console.log("git push origin main");
console.log("git push origin 'refs/notes/pvp/*'");

console.log("\n# Query commits by session:");
console.log(`git log --all --grep="PVP-Session: ${sessionId}"`);

console.log("\n# View PVP notes for a commit:");
console.log("git notes --ref=pvp show HEAD | jq");

// =============================================================================
// STEP 8: Validation
// =============================================================================

console.log("\n" + "-".repeat(60));
console.log("✅ VALIDATION");
console.log("-".repeat(60) + "\n");

const validations = [
  { check: "Git SHA format valid", pass: isGitSha(gitSha) },
  { check: "Confidence score in range", pass: confidenceScore >= 0 && confidenceScore <= 1 },
  { check: "Confidence level matches score", pass: scoreToConfidenceLevel(confidenceScore) === decisionCommit.confidence_level },
  { check: "Decision commit ID generated", pass: decisionCommit.id.startsWith("dec_") },
  { check: "All tool executions successful", pass: toolExecutions.every(t => t.success) },
  { check: "All tool executions approved", pass: toolExecutions.every(t => t.approved_by && t.approved_by.length > 0) },
  { check: "Commit message under 72 chars header", pass: commitMessage.split("\n")[0].length <= 72 },
  { check: "Git notes is valid JSON", pass: (() => { try { JSON.parse(JSON.stringify(gitNotes)); return true; } catch { return false; } })() },
];

for (const v of validations) {
  console.log(`${v.pass ? "✅" : "❌"} ${v.check}`);
}

console.log("\n" + "=".repeat(60));
console.log("DEMONSTRATION COMPLETE");
console.log("=".repeat(60) + "\n");

console.log("This example showed:");
console.log("1. How PVP conversations map to decision metadata");
console.log("2. How tool executions are captured with approvals");
console.log("3. How to generate compliant commit messages with trailers");
console.log("4. How to create rich git notes for full context");
console.log("5. How to query and retrieve decision history");
console.log("");
