// Keywords that suggest tool categories (ordered by priority - more dangerous first)
const CATEGORY_PRIORITY = [
    "secret_access",
    "deploy",
    "shell_execute",
    "file_delete",
    "database",
    "file_write",
    "network_request",
    "external_api",
    "file_read",
];
const CATEGORY_KEYWORDS = {
    secret_access: ["secret", "password", "credential", "token", "auth"],
    deploy: ["deploy", "publish", "release"],
    shell_execute: ["exec", "shell", "command", "spawn", "process"],
    file_delete: ["delete", "remove", "unlink", "rmdir", "trash"],
    database: ["query", "sql", "insert", "table", "database", "db"],
    file_write: ["write", "create", "save", "append", "modify"],
    network_request: ["http", "fetch", "request", "url", "download", "upload"],
    external_api: ["service", "integration", "webhook"],
    file_read: ["read", "get", "list", "search", "find", "contents", "stat"],
    all: [],
};
// Risk level by category
const CATEGORY_RISK_LEVELS = {
    file_read: "low",
    file_write: "medium",
    file_delete: "high",
    shell_execute: "high",
    network_request: "medium",
    deploy: "critical",
    database: "high",
    secret_access: "critical",
    external_api: "medium",
    all: "medium",
};
// Trust level determines default approval requirements
const TRUST_LEVEL_APPROVAL = {
    untrusted: true,
    low: true,
    medium: true, // Only auto-approve read operations
    high: false, // Auto-approve most operations
    trusted: false, // Auto-approve all operations
};
export function categorizeMCPTool(tool, serverConfig) {
    // Check for explicit tool override first
    const override = serverConfig.tool_overrides?.[tool.name];
    if (override?.blocked) {
        // Blocked tools get critical risk and always require approval
        return {
            category: override.category ?? serverConfig.default_category,
            risk_level: "critical",
            requires_approval: true,
        };
    }
    // Determine category
    let category = serverConfig.default_category;
    if (!override?.category) {
        // Infer category from tool name and description (using priority order)
        const searchText = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
        for (const cat of CATEGORY_PRIORITY) {
            const keywords = CATEGORY_KEYWORDS[cat];
            if (keywords.some((kw) => searchText.includes(kw))) {
                category = cat;
                break;
            }
        }
    }
    else {
        category = override.category;
    }
    // Determine risk level
    let risk_level = override?.risk_level ?? CATEGORY_RISK_LEVELS[category];
    // Adjust risk based on trust level
    if (serverConfig.trust_level === "trusted" && risk_level !== "critical") {
        risk_level = "low";
    }
    else if (serverConfig.trust_level === "untrusted" && risk_level === "low") {
        risk_level = "medium";
    }
    // Determine approval requirement
    let requires_approval;
    if (override?.requires_approval !== undefined) {
        // Explicit per-tool override takes highest priority
        requires_approval = override.requires_approval;
    }
    else {
        // Apply trust-level based rules (these take precedence over default_requires_approval)
        // Critical operations ALWAYS require approval
        if (risk_level === "critical") {
            requires_approval = true;
        }
        // Trusted servers auto-approve everything except critical
        else if (serverConfig.trust_level === "trusted") {
            requires_approval = false;
        }
        // High trust servers auto-approve read operations
        else if (serverConfig.trust_level === "high" && category === "file_read") {
            requires_approval = false;
        }
        // Medium trust servers auto-approve read operations
        else if (serverConfig.trust_level === "medium" && category === "file_read") {
            requires_approval = false;
        }
        // Fall back to default_requires_approval or trust-level default
        else if (serverConfig.default_requires_approval !== undefined) {
            requires_approval = serverConfig.default_requires_approval;
        }
        else {
            requires_approval = TRUST_LEVEL_APPROVAL[serverConfig.trust_level];
        }
    }
    return { category, risk_level, requires_approval };
}
export function isToolBlocked(toolName, serverConfig) {
    const override = serverConfig.tool_overrides?.[toolName];
    if (override?.blocked) {
        return { blocked: true, reason: override.block_reason ?? "Tool is blocked by configuration" };
    }
    return { blocked: false };
}
