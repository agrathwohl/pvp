/**
 * REAL MCP Server Integration Test
 *
 * This test actually spawns the @modelcontextprotocol/server-sequential-thinking
 * MCP server and verifies end-to-end functionality.
 *
 * Requirements:
 * - npx must be available in PATH
 * - Network access to download the MCP server package if not cached
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MCPManager } from "../../src/agent/mcp/mcp-manager.js";
import { createMCPServerConfig } from "../../src/config/mcp-config.js";
import type { MCPServerConfig } from "../../src/agent/mcp/mcp-types.js";

describe("MCP Integration - Sequential Thinking Server", () => {
  let mcpManager: MCPManager;
  let serverConfig: MCPServerConfig;

  beforeAll(async () => {
    // Create config for sequential-thinking server
    serverConfig = createMCPServerConfig(
      "sequential-thinking",
      "npx",
      ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      {
        trust_level: "trusted",
        default_requires_approval: false,
      }
    );

    mcpManager = new MCPManager();

    // Add server - this actually spawns the process
    await mcpManager.addServer(serverConfig);
  }, 60000); // 60s timeout for npm package download

  afterAll(async () => {
    await mcpManager.shutdown();
  });

  it("should connect to the sequential-thinking server", () => {
    // If we got here without error, connection succeeded
    expect(true).toBe(true);
  });

  it("should discover the sequentialthinking tool", () => {
    const tools = mcpManager.getAllTools();

    expect(tools.length).toBeGreaterThan(0);

    // Find the sequentialthinking tool
    const seqTool = tools.find(t =>
      t.mcp_tool.name === "sequentialthinking" ||
      t.namespaced_name.includes("sequentialthinking")
    );

    expect(seqTool).toBeDefined();
    expect(seqTool?.server_name).toBe("sequential-thinking");
  });

  it("should have proper namespacing for tools", () => {
    const tools = mcpManager.getAllTools();

    for (const tool of tools) {
      // All tools should be namespaced with server name
      expect(tool.namespaced_name).toContain("sequential-thinking__");
    }
  });

  it("should be able to look up tool by namespaced name", () => {
    const tools = mcpManager.getAllTools();
    const firstTool = tools[0];

    const lookedUp = mcpManager.getTool(firstTool.namespaced_name);

    expect(lookedUp).toBeDefined();
    expect(lookedUp?.namespaced_name).toBe(firstTool.namespaced_name);
  });

  it("should correctly identify MCP tools via isMCPTool", () => {
    const tools = mcpManager.getAllTools();

    for (const tool of tools) {
      expect(mcpManager.isMCPTool(tool.namespaced_name)).toBe(true);
    }

    // Non-MCP tools should return false
    expect(mcpManager.isMCPTool("execute_shell_command")).toBe(false);
    expect(mcpManager.isMCPTool("nonexistent_tool")).toBe(false);
  });

  it("should execute the sequentialthinking tool", async () => {
    const tools = mcpManager.getAllTools();
    const seqTool = tools.find(t => t.mcp_tool.name === "sequentialthinking");

    expect(seqTool).toBeDefined();

    // Call the tool with a simple thought
    const result = await mcpManager.callTool(seqTool!.namespaced_name, {
      thought: "Testing the MCP integration - this is thought 1 of 3",
      nextThoughtNeeded: true,
      thoughtNumber: 1,
      totalThoughts: 3,
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
  }, 30000); // 30s timeout for tool execution

  it("should handle invalid server names gracefully", async () => {
    // Try to call a tool on a non-existent server
    const result = await mcpManager.callTool("nonexistent-server__sometool", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("MCP server not found");
  });

  it("should handle invalid tool name format gracefully", async () => {
    // Try to call with invalid format (no separator)
    const result = await mcpManager.callTool("invalidformat", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid MCP tool name");
  });

  it("should categorize tools with correct risk levels", () => {
    const tools = mcpManager.getAllTools();
    const seqTool = tools.find(t => t.mcp_tool.name === "sequentialthinking");

    expect(seqTool).toBeDefined();

    // Sequential thinking is a trusted, read-only reasoning tool
    // With trust_level: "trusted", risk should be lowered
    expect(seqTool?.risk_level).toBe("low");
    expect(seqTool?.requires_approval).toBe(false);
  });
});

describe("MCP Integration - Multi-Server Management", () => {
  let mcpManager: MCPManager;

  beforeAll(() => {
    mcpManager = new MCPManager();
  });

  afterAll(async () => {
    await mcpManager.shutdown();
  });

  it("should handle adding and removing servers", async () => {
    const config = createMCPServerConfig(
      "test-server",
      "npx",
      ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      { trust_level: "medium" }
    );

    // Add server
    await mcpManager.addServer(config);

    let tools = mcpManager.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.server_name === "test-server")).toBe(true);

    // Remove server
    await mcpManager.removeServer("test-server");

    tools = mcpManager.getAllTools();
    expect(tools.every(t => t.server_name !== "test-server")).toBe(true);
  }, 60000);

  it("should reject duplicate server names", async () => {
    const config = createMCPServerConfig(
      "duplicate-test",
      "npx",
      ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    );

    await mcpManager.addServer(config);

    // Try to add again with same name
    await expect(mcpManager.addServer(config)).rejects.toThrow();

    await mcpManager.removeServer("duplicate-test");
  }, 60000);
});
