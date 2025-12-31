import { describe, it, expect } from "bun:test";
import { categorizeCommand, isCommandBlocked, getDefaultConfig } from "../src/agent/tools/shell-executor.js";

describe("Shell Command Categorization", () => {
  it("categorizes ls as safe read", () => {
    const cmd = categorizeCommand("ls -la");
    expect(cmd.category).toBe("read");
    expect(cmd.riskLevel).toBe("safe");
    expect(cmd.requiresApproval).toBe(false);
  });

  it("categorizes npm install as medium write", () => {
    const cmd = categorizeCommand("npm install lodash");
    expect(cmd.category).toBe("write");
    expect(cmd.riskLevel).toBe("medium");
    expect(cmd.requiresApproval).toBe(true);
  });

  it("categorizes rm -rf as destructive high", () => {
    const cmd = categorizeCommand("rm -rf /tmp/test");
    expect(cmd.category).toBe("destructive");
    expect(cmd.riskLevel).toBe("high");
    expect(cmd.requiresApproval).toBe(true);
  });

  it("blocks rm -rf /", () => {
    const cmd = categorizeCommand("rm -rf /");
    expect(cmd.category).toBe("blocked");
    expect(cmd.riskLevel).toBe("critical");

    const blockCheck = isCommandBlocked(cmd);
    expect(blockCheck.blocked).toBe(true);
  });

  it("blocks fork bomb", () => {
    const cmd = categorizeCommand(":(){ :|:& };:");
    expect(cmd.category).toBe("blocked");
    expect(cmd.riskLevel).toBe("critical");
  });

  it("provides default configs", () => {
    const readCfg = getDefaultConfig("read");
    expect(readCfg.timeout).toBe(30_000);
    expect(readCfg.streaming).toBe(true);
  });
});
