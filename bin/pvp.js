#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = await import(join(__dirname, "..", "package.json"), { with: { type: "json" } });

const program = new Command();

program
  .name("pvp")
  .description("Pair Vibecoding Protocol - Multiplayer human-AI collaboration")
  .version(pkg.default.version);

program
  .command("server")
  .description("Start the PVP WebSocket server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-h, --host <host>", "Host to bind to", "0.0.0.0")
  .action(async (options) => {
    const { startServer } = await import("../dist/server/index.js");
    await startServer({ port: parseInt(options.port), host: options.host });
  });

program
  .command("tui")
  .description("Start the PVP Terminal UI")
  .option("-u, --url <url>", "WebSocket server URL", "ws://localhost:3000")
  .option("-s, --session <id>", "Session ID to join")
  .option("-n, --name <name>", "Your display name", "Human")
  .action(async (options) => {
    const { startTUI } = await import("../dist/tui/index.js");
    await startTUI(options);
  });

program
  .command("agent")
  .description("Start a Claude AI agent")
  .option("-u, --url <url>", "WebSocket server URL", "ws://localhost:3000")
  .option("-s, --session <id>", "Session ID to join")
  .option("-n, --name <name>", "Agent name", "Claude")
  .option("-m, --model <model>", "Claude model to use", "claude-sonnet-4-20250514")
  .action(async (options) => {
    const { startAgent } = await import("../dist/agent/index.js");
    await startAgent(options);
  });

program
  .command("bridge")
  .description("Start the git decision tracking bridge service")
  .option("-p, --port <port>", "HTTP port", "9847")
  .action(async (options) => {
    const { PvpGitBridgeService } = await import("../dist/git-hooks/bridge/index.js");
    const bridge = new PvpGitBridgeService({ http_port: parseInt(options.port) });
    await bridge.start();
  });

program
  .command("install-hooks")
  .description("Install git hooks in current repository")
  .action(async () => {
    const { execSync } = await import("child_process");
    const { existsSync, copyFileSync, chmodSync } = await import("fs");
    const path = await import("path");

    const gitDir = ".git/hooks";
    if (!existsSync(".git")) {
      console.error("Error: Not a git repository");
      process.exit(1);
    }

    const hooksDir = path.join(__dirname, "..", "src", "git-hooks", "hooks");
    const hooks = ["prepare-commit-msg", "post-commit", "pre-push"];

    for (const hook of hooks) {
      const src = path.join(hooksDir, hook);
      const dest = path.join(gitDir, hook);
      if (existsSync(src)) {
        copyFileSync(src, dest);
        chmodSync(dest, 0o755);
        console.log(`Installed: ${hook}`);
      }
    }
    console.log("Git hooks installed successfully");
  });

program.parse();
