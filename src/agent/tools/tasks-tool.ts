/**
 * Tasks Tool - Session Task Tracking and Goal Management
 *
 * Enables the agent to maintain awareness of:
 * - Session goals: The primary objective being worked towards
 * - Task lists: Explicit todo items that need to be completed
 * - Progress tracking: What's done, what's in progress, what's pending
 *
 * Tasks are persisted to the session via context messages and survive
 * agent reconnections.
 */

import { createMessage } from "../../protocol/messages.js";
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export type TaskOperation =
  | "add"
  | "update"
  | "complete"
  | "remove"
  | "list"
  | "clear"
  | "set_goal"
  | "get_goal";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface SessionGoal {
  goal: string;
  set_at: string;
  set_by: ParticipantId;
}

export interface TasksState {
  goal: SessionGoal | null;
  tasks: Task[];
}

/** Serialized state for persistence */
export interface SerializedTasksState {
  goal: SessionGoal | null;
  tasks: Task[];
}

// Operation-specific argument types
export interface AddTaskArgs {
  title: string;
  description?: string;
  priority?: TaskPriority;
}

export interface UpdateTaskArgs {
  task_id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface CompleteTaskArgs {
  task_id: string;
}

export interface RemoveTaskArgs {
  task_id: string;
}

export interface SetGoalArgs {
  goal: string;
}

export type TaskOperationArgs =
  | { operation: "add"; title: string; description?: string; priority?: TaskPriority }
  | { operation: "update"; task_id: string; title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority }
  | { operation: "complete"; task_id: string }
  | { operation: "remove"; task_id: string }
  | { operation: "list" }
  | { operation: "clear" }
  | { operation: "set_goal"; goal: string }
  | { operation: "get_goal" };

export interface TasksExecutionResult {
  success: boolean;
  operation: TaskOperation;
  result?: {
    tasks?: Task[];
    task?: Task;
    goal?: SessionGoal | null;
    message?: string;
  };
  error?: string;
}

// Context key for session-level persistence
export const TASKS_CONTEXT_KEY = "session:tasks";

// ============================================================================
// Task ID Generation
// ============================================================================

function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `task_${timestamp}_${random}`;
}

// ============================================================================
// Operation Descriptions
// ============================================================================

function getOperationDescription(operation: TaskOperation, args: TaskOperationArgs): string {
  switch (operation) {
    case "add":
      return `Add task: "${(args as { title: string }).title}"`;
    case "update":
      return `Update task ${(args as { task_id: string }).task_id}`;
    case "complete":
      return `Complete task ${(args as { task_id: string }).task_id}`;
    case "remove":
      return `Remove task ${(args as { task_id: string }).task_id}`;
    case "list":
      return "List all tasks";
    case "clear":
      return "Clear all tasks";
    case "set_goal":
      return `Set session goal: "${(args as { goal: string }).goal}"`;
    case "get_goal":
      return "Get current session goal";
    default:
      return `Tasks operation: ${operation}`;
  }
}

// ============================================================================
// Handler Interface
// ============================================================================

export interface TasksToolHandler {
  /**
   * Get the current tasks state (for inspection/debugging)
   */
  getState(): TasksState;

  /**
   * Restore state from serialized data (e.g., from session context)
   */
  restoreState(serialized: SerializedTasksState): void;

  /**
   * Get serialized state for persistence
   */
  serializeState(): SerializedTasksState;

  /**
   * Create a proposal for a tasks operation
   */
  proposeTasksOperation(
    args: TaskOperationArgs,
    sessionId: SessionId,
    agentId: ParticipantId
  ): AnyMessage;

  /**
   * Execute a tasks operation
   * Broadcasts state changes to session for persistence
   */
  executeTasksOperation(
    toolProposalId: MessageId,
    args: TaskOperationArgs,
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void
  ): Promise<TasksExecutionResult>;

  /**
   * Get a summary of the current session state for context
   * Useful for providing the agent with awareness of goals/tasks
   */
  getContextSummary(): string;
}

// ============================================================================
// Handler Implementation
// ============================================================================

export function createTasksToolHandler(): TasksToolHandler {
  // Session state - can be restored from session context
  let state: TasksState = {
    goal: null,
    tasks: [],
  };

  // Helper to find task by ID
  function findTask(taskId: string): Task | undefined {
    return state.tasks.find(t => t.id === taskId);
  }

  // Helper to broadcast state to session for persistence
  function persistState(
    sessionId: SessionId,
    agentId: ParticipantId,
    broadcast: (msg: AnyMessage) => void
  ): void {
    const contextMsg = createMessage("context.add", sessionId, agentId, {
      key: TASKS_CONTEXT_KEY,
      content_type: "structured",
      content: {
        goal: state.goal,
        tasks: state.tasks,
      },
      source: "tasks-tool",
      tags: ["tasks", "session-state"],
    });
    broadcast(contextMsg);
  }

  return {
    getState(): TasksState {
      return {
        goal: state.goal,
        tasks: [...state.tasks],
      };
    },

    restoreState(serialized: SerializedTasksState): void {
      state = {
        goal: serialized.goal,
        tasks: serialized.tasks || [],
      };
    },

    serializeState(): SerializedTasksState {
      return {
        goal: state.goal,
        tasks: state.tasks,
      };
    },

    proposeTasksOperation(
      args: TaskOperationArgs,
      sessionId: SessionId,
      agentId: ParticipantId
    ): AnyMessage {
      return createMessage("tool.propose", sessionId, agentId, {
        tool_name: "tasks",
        arguments: args,
        agent: agentId,
        risk_level: "low",
        description: getOperationDescription(args.operation, args),
        requires_approval: false, // Tasks are safe operations
        category: "file_read", // No I/O, just state management
      });
    },

    async executeTasksOperation(
      toolProposalId: MessageId,
      args: TaskOperationArgs,
      sessionId: SessionId,
      agentId: ParticipantId,
      broadcast: (msg: AnyMessage) => void
    ): Promise<TasksExecutionResult> {
      const startTime = Date.now();
      const now = new Date().toISOString();

      // Track if state was mutated (needs persistence)
      let stateMutated = false;

      try {
        let result: TasksExecutionResult["result"];

        switch (args.operation) {
          case "add": {
            const taskId = generateTaskId();
            const task: Task = {
              id: taskId,
              title: args.title,
              description: args.description,
              status: "pending",
              priority: args.priority || "medium",
              created_at: now,
              updated_at: now,
            };
            state.tasks.push(task);
            stateMutated = true;
            result = { task, message: `Task "${args.title}" added with ID ${taskId}` };
            break;
          }

          case "update": {
            const task = findTask(args.task_id);
            if (!task) {
              throw new Error(`Task ${args.task_id} not found`);
            }
            if (args.title !== undefined) task.title = args.title;
            if (args.description !== undefined) task.description = args.description;
            if (args.status !== undefined) task.status = args.status;
            if (args.priority !== undefined) task.priority = args.priority;
            task.updated_at = now;
            if (args.status === "completed" && !task.completed_at) {
              task.completed_at = now;
            }
            stateMutated = true;
            result = { task, message: `Task ${args.task_id} updated` };
            break;
          }

          case "complete": {
            const task = findTask(args.task_id);
            if (!task) {
              throw new Error(`Task ${args.task_id} not found`);
            }
            task.status = "completed";
            task.updated_at = now;
            task.completed_at = now;
            stateMutated = true;
            result = { task, message: `Task "${task.title}" marked as completed` };
            break;
          }

          case "remove": {
            const taskIndex = state.tasks.findIndex(t => t.id === args.task_id);
            if (taskIndex === -1) {
              throw new Error(`Task ${args.task_id} not found`);
            }
            const removed = state.tasks.splice(taskIndex, 1)[0];
            stateMutated = true;
            result = { message: `Task "${removed.title}" removed` };
            break;
          }

          case "list": {
            result = {
              tasks: state.tasks,
              message: state.tasks.length > 0
                ? `Found ${state.tasks.length} task(s)`
                : "No tasks in the list",
            };
            break;
          }

          case "clear": {
            const count = state.tasks.length;
            state.tasks = [];
            stateMutated = true;
            result = { tasks: [], message: `Cleared ${count} task(s)` };
            break;
          }

          case "set_goal": {
            state.goal = {
              goal: args.goal,
              set_at: now,
              set_by: agentId,
            };
            stateMutated = true;
            result = { goal: state.goal, message: `Session goal set: "${args.goal}"` };
            break;
          }

          case "get_goal": {
            result = {
              goal: state.goal,
              message: state.goal
                ? `Current goal: "${state.goal.goal}"`
                : "No session goal set",
            };
            break;
          }

          default:
            throw new Error(`Unknown operation: ${(args as { operation: string }).operation}`);
        }

        const executionTime = Date.now() - startTime;

        // Persist state to session if mutated
        if (stateMutated) {
          persistState(sessionId, agentId, broadcast);
        }

        // Broadcast output message
        const outputMsg = createMessage("tool.output", sessionId, agentId, {
          tool_proposal: toolProposalId,
          stream: "stdout" as const,
          text: result.message + "\n",
          complete: true,
        });
        broadcast(outputMsg);

        // Broadcast result message
        const resultMsg = createMessage("tool.result", sessionId, agentId, {
          tool_proposal: toolProposalId,
          success: true,
          result: result,
          duration_ms: executionTime,
        });
        broadcast(resultMsg);

        return {
          success: true,
          operation: args.operation,
          result,
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        const executionTime = Date.now() - startTime;

        // Broadcast error output
        const errorOutputMsg = createMessage("tool.output", sessionId, agentId, {
          tool_proposal: toolProposalId,
          stream: "stderr" as const,
          text: `Error: ${errorMsg}\n`,
          complete: true,
        });
        broadcast(errorOutputMsg);

        // Broadcast error result
        const resultMsg = createMessage("tool.result", sessionId, agentId, {
          tool_proposal: toolProposalId,
          success: false,
          error: errorMsg,
          duration_ms: executionTime,
        });
        broadcast(resultMsg);

        return {
          success: false,
          operation: args.operation,
          error: errorMsg,
        };
      }
    },

    getContextSummary(): string {
      const lines: string[] = [];

      if (state.goal) {
        lines.push(`## Session Goal`);
        lines.push(`**Goal:** ${state.goal.goal}`);
        lines.push(`*Set at: ${state.goal.set_at}*`);
        lines.push("");
      }

      if (state.tasks.length > 0) {
        lines.push(`## Tasks (${state.tasks.length})`);

        const pending = state.tasks.filter(t => t.status === "pending");
        const inProgress = state.tasks.filter(t => t.status === "in_progress");
        const completed = state.tasks.filter(t => t.status === "completed");

        if (inProgress.length > 0) {
          lines.push("\n### In Progress");
          for (const task of inProgress) {
            lines.push(`- [${task.priority}] ${task.title} (${task.id})`);
            if (task.description) lines.push(`  ${task.description}`);
          }
        }

        if (pending.length > 0) {
          lines.push("\n### Pending");
          for (const task of pending) {
            lines.push(`- [${task.priority}] ${task.title} (${task.id})`);
            if (task.description) lines.push(`  ${task.description}`);
          }
        }

        if (completed.length > 0) {
          lines.push("\n### Completed");
          for (const task of completed) {
            lines.push(`- ~~${task.title}~~ (${task.id})`);
          }
        }
      }

      return lines.length > 0 ? lines.join("\n") : "No goals or tasks set for this session.";
    },
  };
}
