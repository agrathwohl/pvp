import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  categorizeFilePath,
  isPathBlocked,
  writeFile,
  editFile,
  getDefaultFileConfig,
} from "../src/agent/tools/file-executor.js";

describe("File Path Categorization", () => {
  it("categorizes markdown files as safe", () => {
    const cmd = categorizeFilePath("README.md");
    expect(cmd.riskLevel).toBe("safe");
    expect(cmd.requiresApproval).toBe(false);
  });

  it("categorizes JSON data files as safe", () => {
    const cmd = categorizeFilePath("data/config.json");
    expect(cmd.riskLevel).toBe("safe");
    expect(cmd.requiresApproval).toBe(false);
  });

  it("categorizes TypeScript source files as low risk", () => {
    const cmd = categorizeFilePath("src/index.ts");
    expect(cmd.riskLevel).toBe("low");
    expect(cmd.requiresApproval).toBe(false);
  });

  it("categorizes JavaScript files as low risk", () => {
    const cmd = categorizeFilePath("src/utils.js");
    expect(cmd.riskLevel).toBe("low");
    expect(cmd.requiresApproval).toBe(false);
  });

  it("categorizes YAML config files as medium risk", () => {
    const cmd = categorizeFilePath("config.yaml");
    expect(cmd.riskLevel).toBe("medium");
    expect(cmd.requiresApproval).toBe(true);
  });

  it("categorizes package.json as medium risk", () => {
    const cmd = categorizeFilePath("package.json");
    expect(cmd.riskLevel).toBe("medium");
    expect(cmd.requiresApproval).toBe(true);
  });

  it("categorizes shell scripts as high risk", () => {
    const cmd = categorizeFilePath("scripts/deploy.sh");
    expect(cmd.riskLevel).toBe("high");
    expect(cmd.requiresApproval).toBe(true);
  });

  it("categorizes .env files as critical and blocked", () => {
    const cmd = categorizeFilePath(".env");
    expect(cmd.riskLevel).toBe("critical");

    const blockCheck = isPathBlocked(".env");
    expect(blockCheck.blocked).toBe(true);
    expect(blockCheck.reason).toContain("secrets");
  });

  it("categorizes .env.local as critical and blocked", () => {
    const blockCheck = isPathBlocked(".env.local");
    expect(blockCheck.blocked).toBe(true);
  });

  it("categorizes SSH keys as critical and blocked", () => {
    const blockCheck = isPathBlocked("id_rsa");
    expect(blockCheck.blocked).toBe(true);
    expect(blockCheck.reason).toContain("SSH");
  });

  it("categorizes .pem files as critical and blocked", () => {
    const blockCheck = isPathBlocked("server.pem");
    expect(blockCheck.blocked).toBe(true);
    expect(blockCheck.reason).toContain("key");
  });
});

describe("System Path Blocking", () => {
  it("blocks /etc/ paths", () => {
    const blockCheck = isPathBlocked("/etc/passwd");
    expect(blockCheck.blocked).toBe(true);
    expect(blockCheck.reason).toContain("System");
  });

  it("blocks /usr/ paths", () => {
    const blockCheck = isPathBlocked("/usr/bin/node");
    expect(blockCheck.blocked).toBe(true);
  });

  it("blocks /var/ paths", () => {
    const blockCheck = isPathBlocked("/var/log/syslog");
    expect(blockCheck.blocked).toBe(true);
  });

  it("blocks /proc/ paths", () => {
    const blockCheck = isPathBlocked("/proc/self/environ");
    expect(blockCheck.blocked).toBe(true);
  });

  it("blocks /dev/ paths", () => {
    const blockCheck = isPathBlocked("/dev/sda");
    expect(blockCheck.blocked).toBe(true);
  });

  it("allows project-relative paths", () => {
    const blockCheck = isPathBlocked("src/index.ts");
    expect(blockCheck.blocked).toBe(false);
  });
});

describe("File Write Operations", () => {
  const testDir = join(process.cwd(), "test-temp-files");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("writes a file successfully", async () => {
    const filePath = join(testDir, "test.txt");
    const content = "Hello, World!";

    const result = await writeFile(filePath, content);

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(13);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe(content);
  });

  it("creates parent directories when requested", async () => {
    const filePath = join(testDir, "nested", "deep", "file.txt");
    const content = "Nested content";

    const result = await writeFile(filePath, content, { createDirs: true });

    expect(result.success).toBe(true);
    expect(existsSync(filePath)).toBe(true);
  });

  it("fails when parent directory doesn't exist and createDirs is false", async () => {
    const filePath = join(testDir, "nonexistent", "file.txt");
    const content = "Test content";

    const result = await writeFile(filePath, content, { createDirs: false });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Parent directory does not exist");
  });

  it("rejects blocked paths", async () => {
    const result = await writeFile("/etc/passwd", "malicious content");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Path blocked");
  });

  it("handles unicode content correctly", async () => {
    const filePath = join(testDir, "unicode.txt");
    const content = "Hello, World!";

    const result = await writeFile(filePath, content);

    expect(result.success).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe(content);
  });
});

describe("File Edit Operations", () => {
  const testDir = join(process.cwd(), "test-temp-files");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("replaces all occurrences when occurrence=0", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "foo bar foo baz foo");

    const result = await editFile(filePath, "foo", "qux", 0);

    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(3);
    expect(result.replacements).toBe(3);
    expect(readFileSync(filePath, "utf-8")).toBe("qux bar qux baz qux");
  });

  it("replaces only first occurrence when occurrence=1", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "foo bar foo baz foo");

    const result = await editFile(filePath, "foo", "qux", 1);

    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(3);
    expect(result.replacements).toBe(1);
    expect(readFileSync(filePath, "utf-8")).toBe("qux bar foo baz foo");
  });

  it("replaces second occurrence when occurrence=2", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "foo bar foo baz foo");

    const result = await editFile(filePath, "foo", "qux", 2);

    expect(result.success).toBe(true);
    expect(result.replacements).toBe(1);
    expect(readFileSync(filePath, "utf-8")).toBe("foo bar qux baz foo");
  });

  it("fails when old text not found", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "hello world");

    const result = await editFile(filePath, "foo", "bar", 0);

    expect(result.success).toBe(false);
    expect(result.matchCount).toBe(0);
    expect(result.error).toContain("not found");
  });

  it("fails when requested occurrence exceeds match count", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "foo bar foo");

    const result = await editFile(filePath, "foo", "qux", 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain("only 2 found");
  });

  it("fails with negative occurrence", async () => {
    const filePath = join(testDir, "edit-test.txt");
    writeFileSync(filePath, "foo bar foo");

    const result = await editFile(filePath, "foo", "qux", -1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Occurrence must be");
  });

  it("fails for non-existent file", async () => {
    const result = await editFile(join(testDir, "nonexistent.txt"), "foo", "bar", 0);

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });

  it("fails for directory path", async () => {
    const result = await editFile(testDir, "foo", "bar", 0);

    expect(result.success).toBe(false);
    expect(result.error).toContain("directory");
  });

  it("rejects blocked paths", async () => {
    const result = await editFile("/etc/passwd", "root", "admin", 0);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Path blocked");
  });

  it("handles multiline text replacement", async () => {
    const filePath = join(testDir, "multiline.txt");
    writeFileSync(filePath, "line1\nline2\nline3");

    const result = await editFile(filePath, "line2\n", "replaced\n", 0);

    expect(result.success).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("line1\nreplaced\nline3");
  });
});

describe("Default File Config", () => {
  it("provides reasonable defaults", () => {
    const config = getDefaultFileConfig();
    expect(config.maxFileSize).toBe(10 * 1024 * 1024); // 10MB
    expect(config.encoding).toBe("utf-8");
  });
});
