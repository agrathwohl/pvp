/**
 * Tool Definitions for PVP Agent
 *
 * Static tool definitions for all built-in tools. These schemas define
 * the interface Claude uses to invoke tools with proper parameters.
 */

import type { ToolDefinition } from "../providers/types.js";

// ===========================================================================
// Shell Tool
// ===========================================================================

export const SHELL_TOOL_DEFINITION: Tool = {
  name: "execute_shell_command",
  description: "Execute a shell command with safety controls and approval workflows. Commands are categorized by risk (safe/low/medium/high/critical) and may require human approval.",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The full shell command to execute (e.g., 'ls -la', 'npm install lodash')"
      }
    },
    required: ["command"]
  }
};

// ===========================================================================
// File Tools
// ===========================================================================

export const FILE_WRITE_TOOL_DEFINITION: Tool = {
  name: "file_write",
  description: "Write content to a file with safety controls. Files are categorized by risk based on path and type. System directories and sensitive files are blocked. Source code files require approval.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The file path to write to (absolute or relative to project root)"
      },
      content: {
        type: "string",
        description: "The content to write to the file"
      },
      create_dirs: {
        type: "boolean",
        description: "Whether to create parent directories if they don't exist (default: false)"
      }
    },
    required: ["path", "content"]
  }
};

export const FILE_EDIT_TOOL_DEFINITION: Tool = {
  name: "file_edit",
  description: "Edit a file by replacing text. Finds occurrences of old_text and replaces with new_text. Use occurrence=0 to replace all, or specify which occurrence to replace.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The file path to edit (absolute or relative to project root)"
      },
      old_text: {
        type: "string",
        description: "The exact text to find and replace"
      },
      new_text: {
        type: "string",
        description: "The text to replace old_text with"
      },
      occurrence: {
        type: "number",
        description: "Which occurrence to replace: 0 = all occurrences, 1 = first, 2 = second, etc. (default: 0)"
      }
    },
    required: ["path", "old_text", "new_text"]
  }
};

// ===========================================================================
// Git Tool
// ===========================================================================

export const GIT_COMMIT_TOOL_DEFINITION: Tool = {
  name: "git_commit",
  description: "Create a git commit following the PVP Git Commit Protocol with rich decision context. Use conventional commit types and include session/participant tracking via git trailers.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["feat", "fix", "refactor", "explore", "revert", "docs", "test", "chore", "style"],
        description: "Conventional commit type"
      },
      description: {
        type: "string",
        description: "Short description of the change (imperative mood, lowercase)"
      },
      scope: {
        type: "string",
        description: "Optional scope (e.g., component name, module)"
      },
      body: {
        type: "string",
        description: "Optional longer description explaining what and why"
      },
      confidence: {
        type: "number",
        description: "Confidence level 0.0-1.0 in the decision"
      },
      decision_type: {
        type: "string",
        enum: ["implementation", "architecture", "exploration", "correction", "reversion", "merge-resolution"],
        description: "Type of decision this commit represents"
      }
    },
    required: ["type", "description"]
  }
};

// ===========================================================================
// Notebook Tool
// ===========================================================================

export const NOTEBOOK_EXECUTE_TOOL_DEFINITION: Tool = {
  name: "notebook_execute",
  description: "Execute a Jupyter notebook and return the executed .ipynb with outputs populated. The result is broadcast as context.add with key 'notebook:executed:{filename}' for notebook-viewer.tsx to render. Can also convert to html/markdown/pdf if specified. Requires human approval due to arbitrary code execution.",
  input_schema: {
    type: "object",
    properties: {
      notebook_path: {
        type: "string",
        description: "Path to the .ipynb notebook file (absolute or relative to working directory)"
      },
      output_format: {
        type: "string",
        enum: ["notebook", "html", "markdown", "pdf"],
        description: "Output format: 'notebook' (default) returns executed .ipynb with outputs, others convert to standalone files"
      }
    },
    required: ["notebook_path"]
  }
};

// ===========================================================================
// NPM Tool
// ===========================================================================

export const NPM_TOOL_DEFINITION: Tool = {
  name: "npm",
  description: "Manage npm/yarn/bun packages. Can init projects, install/add/remove packages, run scripts, and audit dependencies. Auto-detects package manager from lockfile.",
  input_schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["init", "install", "add", "remove", "update", "run", "audit", "list", "outdated", "publish", "link", "exec"],
        description: "Operation: init (create package.json), install (all deps), add (specific pkg), remove, update, run (scripts), audit, list, outdated, publish, link, exec (npx/bunx)"
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Arguments: package names for add/remove, script name for run, command for exec"
      },
      package_manager: {
        type: "string",
        enum: ["npm", "yarn", "bun", "pnpm"],
        description: "Package manager (auto-detected from lockfile if not specified)"
      }
    },
    required: ["operation"]
  }
};

// ===========================================================================
// Tasks Tool
// ===========================================================================

export const TASKS_TOOL_DEFINITION: Tool = {
  name: "tasks",
  description: "Manage session tasks and goals. Track what needs to be done, update progress, and maintain awareness of the session objective. Use this when prompters inform you of goals or tasks to complete. Tasks are persisted to the session and survive agent reconnections.",
  input_schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "update", "complete", "remove", "list", "clear", "set_goal", "get_goal"],
        description: "Operation: add (new task), update (modify task), complete (mark done), remove (delete), list (show all), clear (remove all), set_goal (session objective), get_goal (current objective)"
      },
      title: {
        type: "string",
        description: "Task title (required for add operation)"
      },
      description: {
        type: "string",
        description: "Optional task description"
      },
      task_id: {
        type: "string",
        description: "Task ID (required for update/complete/remove operations)"
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "Task status (for update operation)"
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Task priority (default: medium)"
      },
      goal: {
        type: "string",
        description: "Session goal text (required for set_goal operation)"
      }
    },
    required: ["operation"]
  }
};

// ===========================================================================
// Combined Export
// ===========================================================================

/**
 * All built-in tool definitions.
 * MCP tools are added dynamically by the agent.
 */
export const BUILTIN_TOOL_DEFINITIONS: Tool[] = [
  SHELL_TOOL_DEFINITION,
  FILE_WRITE_TOOL_DEFINITION,
  FILE_EDIT_TOOL_DEFINITION,
  GIT_COMMIT_TOOL_DEFINITION,
  NOTEBOOK_EXECUTE_TOOL_DEFINITION,
  NPM_TOOL_DEFINITION,
  TASKS_TOOL_DEFINITION,
];

/**
 * Tool names for quick lookup
 */
export const TOOL_NAMES = {
  SHELL: "execute_shell_command",
  FILE_WRITE: "file_write",
  FILE_EDIT: "file_edit",
  GIT_COMMIT: "git_commit",
  NOTEBOOK_EXECUTE: "notebook_execute",
  NPM: "npm",
  TASKS: "tasks",
} as const;

export type BuiltinToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];
