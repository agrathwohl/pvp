import { describe, it, expect } from "vitest";
import {
  loadMCPConfig,
  validateMCPConfig,
  applyPreset,
  createMCPServerConfig,
  MCP_SERVER_PRESETS,
} from "../../src/config/mcp-config.js";

describe("loadMCPConfig", () => {
  it("should parse minimal valid configuration", () => {
    const rawConfig = {
      mcpServers: {
        "test-server": {
          command: "node",
          args: ["server.js"],
        },
      },
    };

    const configs = loadMCPConfig(rawConfig);

    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe("test-server");
    expect(configs[0].command).toBe("node");
    expect(configs[0].args).toEqual(["server.js"]);
    // Check defaults
    expect(configs[0].transport).toBe("stdio");
    expect(configs[0].trust_level).toBe("medium");
    expect(configs[0].default_category).toBe("external_api");
    expect(configs[0].default_requires_approval).toBe(true);
    expect(configs[0].reconnect_attempts).toBe(3);
  });

  it("should parse full configuration with all options", () => {
    const rawConfig = {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
          transport: "stdio",
          trust_level: "high",
          default_category: "file_write",
          default_requires_approval: false,
          tool_overrides: {
            delete_file: {
              category: "file_delete",
              risk_level: "critical",
              requires_approval: true,
            },
          },
          health_check_interval_ms: 60000,
          reconnect_attempts: 5,
          reconnect_delay_ms: 10000,
          startup_timeout_ms: 60000,
        },
      },
    };

    const configs = loadMCPConfig(rawConfig);

    expect(configs).toHaveLength(1);
    const config = configs[0];
    expect(config.name).toBe("filesystem");
    expect(config.trust_level).toBe("high");
    expect(config.default_category).toBe("file_write");
    expect(config.tool_overrides?.delete_file?.risk_level).toBe("critical");
    expect(config.health_check_interval_ms).toBe(60000);
    expect(config.reconnect_attempts).toBe(5);
  });

  it("should parse multiple servers", () => {
    const rawConfig = {
      mcpServers: {
        filesystem: { command: "fs-server" },
        "sequential-thinking": { command: "seq-server" },
        playwright: { command: "pw-server" },
      },
    };

    const configs = loadMCPConfig(rawConfig);

    expect(configs).toHaveLength(3);
    expect(configs.map((c) => c.name).sort()).toEqual([
      "filesystem",
      "playwright",
      "sequential-thinking",
    ]);
  });

  it("should handle empty servers object", () => {
    const rawConfig = { mcpServers: {} };

    const configs = loadMCPConfig(rawConfig);

    expect(configs).toHaveLength(0);
  });
});

describe("validateMCPConfig", () => {
  it("should return valid=true for valid config", () => {
    const rawConfig = {
      mcpServers: {
        test: { command: "test-cmd" },
      },
    };

    const result = validateMCPConfig(rawConfig);

    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it("should return valid=false with errors for invalid config", () => {
    const rawConfig = {
      mcpServers: {
        test: {
          // Missing required 'command'
          args: ["test"],
        },
      },
    };

    const result = validateMCPConfig(rawConfig);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.config).toBeUndefined();
  });

  it("should validate trust_level enum values", () => {
    const rawConfig = {
      mcpServers: {
        test: {
          command: "test",
          trust_level: "invalid_trust_level",
        },
      },
    };

    const result = validateMCPConfig(rawConfig);

    expect(result.valid).toBe(false);
    expect(result.errors?.issues.some((i) => i.path.includes("trust_level"))).toBe(true);
  });

  it("should validate risk_level enum in tool_overrides", () => {
    const rawConfig = {
      mcpServers: {
        test: {
          command: "test",
          tool_overrides: {
            some_tool: {
              risk_level: "super_high", // Invalid
            },
          },
        },
      },
    };

    const result = validateMCPConfig(rawConfig);

    expect(result.valid).toBe(false);
  });
});

describe("applyPreset", () => {
  it("should apply filesystem preset", () => {
    const baseConfig = {
      name: "my-filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
    };

    const config = applyPreset(baseConfig, "filesystem");

    expect(config.trust_level).toBe("medium");
    expect(config.default_category).toBe("file_write");
    expect(config.tool_overrides?.read_file?.requires_approval).toBe(false);
    expect(config.tool_overrides?.delete_file?.risk_level).toBe("high");
  });

  it("should apply sequential-thinking preset", () => {
    const baseConfig = {
      name: "seq",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    };

    const config = applyPreset(baseConfig, "sequential-thinking");

    expect(config.trust_level).toBe("trusted");
    expect(config.default_requires_approval).toBe(false);
  });

  it("should allow overriding preset values", () => {
    const baseConfig = {
      name: "custom-fs",
      command: "fs-server",
      trust_level: "untrusted" as const, // Override preset's "medium"
      tool_overrides: {
        read_file: { requires_approval: true }, // Override preset's false
      },
    };

    const config = applyPreset(baseConfig, "filesystem");

    expect(config.trust_level).toBe("untrusted");
    expect(config.tool_overrides?.read_file?.requires_approval).toBe(true);
    // But still get other preset tool_overrides
    expect(config.tool_overrides?.delete_file?.risk_level).toBe("high");
  });

  it("should throw for unknown preset", () => {
    const baseConfig = { name: "test", command: "test" };

    expect(() => applyPreset(baseConfig, "nonexistent-preset")).toThrow(
      "Unknown MCP server preset: nonexistent-preset"
    );
  });
});

describe("createMCPServerConfig", () => {
  it("should create config with defaults", () => {
    const config = createMCPServerConfig("test", "test-cmd");

    expect(config.name).toBe("test");
    expect(config.command).toBe("test-cmd");
    expect(config.args).toEqual([]);
    expect(config.transport).toBe("stdio");
    expect(config.trust_level).toBe("medium");
  });

  it("should create config with custom options", () => {
    const config = createMCPServerConfig("test", "test-cmd", ["--flag"], {
      trust_level: "trusted",
      default_requires_approval: false,
    });

    expect(config.args).toEqual(["--flag"]);
    expect(config.trust_level).toBe("trusted");
    expect(config.default_requires_approval).toBe(false);
  });
});

describe("MCP_SERVER_PRESETS", () => {
  it("should have filesystem preset with correct tool_overrides", () => {
    const preset = MCP_SERVER_PRESETS.filesystem;

    expect(preset).toBeDefined();
    expect(preset.tool_overrides?.read_file?.category).toBe("file_read");
    expect(preset.tool_overrides?.write_file?.category).toBe("file_write");
    expect(preset.tool_overrides?.delete_file?.category).toBe("file_delete");
  });

  it("should have sequential-thinking preset with trusted level", () => {
    const preset = MCP_SERVER_PRESETS["sequential-thinking"];

    expect(preset).toBeDefined();
    expect(preset.trust_level).toBe("trusted");
    expect(preset.default_requires_approval).toBe(false);
  });

  it("should have playwright preset", () => {
    const preset = MCP_SERVER_PRESETS.playwright;

    expect(preset).toBeDefined();
    expect(preset.default_category).toBe("network_request");
  });
});
