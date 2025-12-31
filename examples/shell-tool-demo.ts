/**
 * Shell Tool Demo for PVP
 *
 * This demo showcases the shell command execution capabilities:
 * - Safe commands (auto-approved)
 * - Commands requiring approval
 * - Streaming output to all participants
 * - Real-time collaboration on command execution
 */

import { ClaudeAgent } from "../src/agent/claude-agent.js";

async function main() {
  console.log("🚀 PVP Shell Tool Demo\n");

  // Initialize Claude agent
  const agent = new ClaudeAgent({
    serverUrl: "ws://localhost:3000",
    agentName: "Shell Assistant",
    model: "claude-sonnet-4-5-20250929",
  });

  console.log("📡 Connecting to PVP server...");
  await agent.connect();

  // Wait for connection
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\n✅ Connected! Agent can now propose shell commands.\n");

  // Demo 1: Safe command (auto-approved)
  console.log("Demo 1: Safe Command (ls -la)");
  console.log("================================");
  console.log("This command will be auto-approved and executed immediately.\n");

  try {
    const proposalId1 = await agent.proposeShellCommand("ls -la");
    console.log(`✓ Proposed command with ID: ${proposalId1}`);
    console.log("  Category: read (safe)");
    console.log("  Approval: NOT required (auto-approved)");
    console.log("  Risk Level: safe\n");
  } catch (error) {
    console.error(`✗ Error: ${error instanceof Error ? error.message : error}\n`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 2: Write command (requires approval)
  console.log("\nDemo 2: Write Command (mkdir /tmp/pvp-test)");
  console.log("============================================");
  console.log("This command requires human approval before execution.\n");

  try {
    const proposalId2 = await agent.proposeShellCommand("mkdir /tmp/pvp-test");
    console.log(`✓ Proposed command with ID: ${proposalId2}`);
    console.log("  Category: write");
    console.log("  Approval: REQUIRED");
    console.log("  Risk Level: low");
    console.log("  → Gate created, waiting for human approval...\n");
  } catch (error) {
    console.error(`✗ Error: ${error instanceof Error ? error.message : error}\n`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 3: Destructive command (requires approval with high risk)
  console.log("\nDemo 3: Destructive Command (rm -rf /tmp/pvp-test)");
  console.log("====================================================");
  console.log("High-risk commands require explicit approval.\n");

  try {
    const proposalId3 = await agent.proposeShellCommand("rm -rf /tmp/pvp-test");
    console.log(`✓ Proposed command with ID: ${proposalId3}`);
    console.log("  Category: destructive");
    console.log("  Approval: REQUIRED");
    console.log("  Risk Level: high");
    console.log("  → Gate created with high-risk warning\n");
  } catch (error) {
    console.error(`✗ Error: ${error instanceof Error ? error.message : error}\n`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 4: Blocked command (will fail)
  console.log("\nDemo 4: Blocked Command (rm -rf /)");
  console.log("====================================");
  console.log("Catastrophic commands are blocked entirely.\n");

  try {
    await agent.proposeShellCommand("rm -rf /");
    console.log("✗ This should have been blocked!");
  } catch (error) {
    console.log(`✓ Command blocked (as expected): ${error instanceof Error ? error.message : error}\n`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Demo 5: Command with streaming output
  console.log("\nDemo 5: Streaming Output (echo test && sleep 1 && echo done)");
  console.log("=============================================================");
  console.log("Output is streamed in real-time to all participants.\n");

  try {
    const proposalId5 = await agent.proposeShellCommand("echo 'Starting...' && sleep 1 && echo 'Done!'");
    console.log(`✓ Proposed command with ID: ${proposalId5}`);
    console.log("  → stdout/stderr will stream to all participants\n");
  } catch (error) {
    console.error(`✗ Error: ${error instanceof Error ? error.message : error}\n`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo Complete!");
  console.log("=".repeat(60));
  console.log("\nKey Features Demonstrated:");
  console.log("  ✓ Command risk categorization (safe/low/medium/high/critical)");
  console.log("  ✓ Automatic approval for safe commands");
  console.log("  ✓ Gate workflow for risky commands");
  console.log("  ✓ Safety blocking for catastrophic commands");
  console.log("  ✓ Streaming output to all participants");
  console.log("\nThe TUI displays:");
  console.log("  • Tool proposals with risk levels");
  console.log("  • Real-time command output (stdout/stderr)");
  console.log("  • Execution results and timing");
  console.log("  • Gate approval prompts");

  // Keep connection alive
  console.log("\nPress Ctrl+C to exit...");
  await new Promise(() => {}); // Keep alive
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
