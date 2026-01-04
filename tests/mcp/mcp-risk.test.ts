import { describe, it, expect } from "vitest";
import { categorizeMCPTool, isToolBlocked } from "../../src/agent/mcp/mcp-risk.js";
import type { MCPServerConfig } from "../../src/agent/mcp/mcp-types.js";
import type { Tool as MCPTool } from "@modelcontextprotocol/sdk/types.js";

// Helper to create mock MCP tools
function createMockTool(name: string, description?: string): MCPTool {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {} },
  };
}

// Helper to create server configs with defaults
function createServerConfig(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    name: "test-server",
    command: "echo",
    args: [],
    transport: "stdio",
    trust_level: "medium",
    default_category: "external_api",
    default_requires_approval: true,
    ...overrides,
  };
}

describe("categorizeMCPTool", () => {
  describe("category inference from tool name", () => {
    it("should categorize read tools as file_read", () => {
      const tool = createMockTool("read_file", "Read a file from disk");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("file_read");
    });

    it("should categorize list tools as file_read", () => {
      const tool = createMockTool("list_directory", "List files in directory");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("file_read");
    });

    it("should categorize write tools as file_write", () => {
      const tool = createMockTool("write_file", "Write content to a file");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("file_write");
    });

    it("should categorize delete tools as file_delete", () => {
      const tool = createMockTool("delete_file", "Delete a file");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("file_delete");
    });

    it("should categorize shell/exec tools as shell_execute", () => {
      const tool = createMockTool("exec_command", "Execute a shell command");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("shell_execute");
    });

    it("should categorize http/fetch tools as network_request", () => {
      const tool = createMockTool("fetch_url", "Fetch content from URL");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("network_request");
    });

    it("should use description for category inference", () => {
      const tool = createMockTool("do_thing", "Query the database for records");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("database");
    });

    it("should fall back to default_category when no keywords match", () => {
      const tool = createMockTool("mysterious_operation", "Does something mysterious");
      const config = createServerConfig({ default_category: "external_api" });

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("external_api");
    });
  });

  describe("risk level assignment", () => {
    it("should assign low risk to file_read category", () => {
      const tool = createMockTool("read_file");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("low");
    });

    it("should assign medium risk to file_write category", () => {
      const tool = createMockTool("write_file");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("medium");
    });

    it("should assign high risk to file_delete category", () => {
      const tool = createMockTool("delete_file");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("high");
    });

    it("should assign high risk to shell_execute category", () => {
      const tool = createMockTool("exec_command");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("high");
    });

    it("should assign critical risk to deploy category", () => {
      const tool = createMockTool("deploy_app", "Deploy the application");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("critical");
    });

    it("should assign critical risk to secret_access category", () => {
      const tool = createMockTool("get_secret", "Access secret credentials");
      const config = createServerConfig();

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("critical");
    });
  });

  describe("trust level interactions", () => {
    it("should downgrade risk to low for trusted servers (except critical)", () => {
      const tool = createMockTool("delete_file"); // normally high risk
      const config = createServerConfig({ trust_level: "trusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("low");
    });

    it("should NOT downgrade critical risk even for trusted servers", () => {
      const tool = createMockTool("deploy_app");
      const config = createServerConfig({ trust_level: "trusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("critical");
    });

    it("should upgrade low risk to medium for untrusted servers", () => {
      const tool = createMockTool("read_file"); // normally low risk
      const config = createServerConfig({ trust_level: "untrusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("medium");
    });

    it("should auto-approve file_read for high trust servers", () => {
      const tool = createMockTool("read_file");
      const config = createServerConfig({
        trust_level: "high",
        default_requires_approval: true // explicit default, but should still auto-approve reads
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(false);
    });

    it("should auto-approve file_read for medium trust servers", () => {
      const tool = createMockTool("read_file");
      const config = createServerConfig({
        trust_level: "medium",
        default_requires_approval: true
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(false);
    });

    it("should require approval for all operations from untrusted servers", () => {
      const tool = createMockTool("read_file");
      const config = createServerConfig({ trust_level: "untrusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(true);
    });

    it("should auto-approve all for trusted servers (except critical)", () => {
      const tool = createMockTool("write_file");
      const config = createServerConfig({ trust_level: "trusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(false);
    });

    it("should always require approval for critical operations", () => {
      const tool = createMockTool("deploy_app");
      const config = createServerConfig({ trust_level: "trusted" });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(true);
    });
  });

  describe("tool overrides", () => {
    it("should use explicit category override", () => {
      const tool = createMockTool("custom_tool");
      const config = createServerConfig({
        tool_overrides: {
          custom_tool: { category: "database" }
        }
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.category).toBe("database");
    });

    it("should use explicit risk_level override", () => {
      const tool = createMockTool("read_file"); // normally low
      const config = createServerConfig({
        tool_overrides: {
          read_file: { risk_level: "critical" }
        }
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("critical");
    });

    it("should use explicit requires_approval override", () => {
      const tool = createMockTool("read_file");
      const config = createServerConfig({
        trust_level: "trusted", // normally would auto-approve
        tool_overrides: {
          read_file: { requires_approval: true }
        }
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.requires_approval).toBe(true);
    });

    it("should mark blocked tools as critical and require approval", () => {
      const tool = createMockTool("dangerous_tool");
      const config = createServerConfig({
        trust_level: "trusted",
        tool_overrides: {
          dangerous_tool: { blocked: true }
        }
      });

      const result = categorizeMCPTool(tool, config);

      expect(result.risk_level).toBe("critical");
      expect(result.requires_approval).toBe(true);
    });
  });
});

describe("isToolBlocked", () => {
  it("should return blocked=false for non-blocked tools", () => {
    const config = createServerConfig();

    const result = isToolBlocked("read_file", config);

    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("should return blocked=true with reason for blocked tools", () => {
    const config = createServerConfig({
      tool_overrides: {
        dangerous_tool: { blocked: true, block_reason: "Security risk" }
      }
    });

    const result = isToolBlocked("dangerous_tool", config);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("Security risk");
  });

  it("should provide default reason when block_reason not specified", () => {
    const config = createServerConfig({
      tool_overrides: {
        dangerous_tool: { blocked: true }
      }
    });

    const result = isToolBlocked("dangerous_tool", config);

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("Tool is blocked by configuration");
  });
});
