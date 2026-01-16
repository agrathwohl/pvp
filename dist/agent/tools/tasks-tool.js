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
// Context key for session-level persistence
export const TASKS_CONTEXT_KEY = "session:tasks";
// ============================================================================
// Task ID Generation
// ============================================================================
function generateTaskId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `task_${timestamp}_${random}`;
}
// ============================================================================
// Operation Descriptions
// ============================================================================
function getOperationDescription(operation, args) {
    switch (operation) {
        case "add":
            return `Add task: "${args.title}"`;
        case "update":
            return `Update task ${args.task_id}`;
        case "complete":
            return `Complete task ${args.task_id}`;
        case "remove":
            return `Remove task ${args.task_id}`;
        case "list":
            return "List all tasks";
        case "clear":
            return "Clear all tasks";
        case "set_goal":
            return `Set session goal: "${args.goal}"`;
        case "get_goal":
            return "Get current session goal";
        default:
            return `Tasks operation: ${operation}`;
    }
}
// ============================================================================
// Handler Implementation
// ============================================================================
export function createTasksToolHandler() {
    // Session state - can be restored from session context
    let state = {
        goal: null,
        tasks: [],
    };
    // Helper to find task by ID
    function findTask(taskId) {
        return state.tasks.find(t => t.id === taskId);
    }
    // Helper to broadcast state to session for persistence
    function persistState(sessionId, agentId, broadcast) {
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
        getState() {
            return {
                goal: state.goal,
                tasks: [...state.tasks],
            };
        },
        restoreState(serialized) {
            state = {
                goal: serialized.goal,
                tasks: serialized.tasks || [],
            };
        },
        serializeState() {
            return {
                goal: state.goal,
                tasks: state.tasks,
            };
        },
        proposeTasksOperation(args, sessionId, agentId) {
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
        async executeTasksOperation(toolProposalId, args, sessionId, agentId, broadcast) {
            const startTime = Date.now();
            const now = new Date().toISOString();
            // Track if state was mutated (needs persistence)
            let stateMutated = false;
            try {
                let result;
                switch (args.operation) {
                    case "add": {
                        const taskId = generateTaskId();
                        const task = {
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
                        if (args.title !== undefined)
                            task.title = args.title;
                        if (args.description !== undefined)
                            task.description = args.description;
                        if (args.status !== undefined)
                            task.status = args.status;
                        if (args.priority !== undefined)
                            task.priority = args.priority;
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
                        throw new Error(`Unknown operation: ${args.operation}`);
                }
                const executionTime = Date.now() - startTime;
                // Persist state to session if mutated
                if (stateMutated) {
                    persistState(sessionId, agentId, broadcast);
                }
                // Broadcast output message
                const outputMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stdout",
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
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : "Unknown error";
                const executionTime = Date.now() - startTime;
                // Broadcast error output
                const errorOutputMsg = createMessage("tool.output", sessionId, agentId, {
                    tool_proposal: toolProposalId,
                    stream: "stderr",
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
        getContextSummary() {
            const lines = [];
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
                        if (task.description)
                            lines.push(`  ${task.description}`);
                    }
                }
                if (pending.length > 0) {
                    lines.push("\n### Pending");
                    for (const task of pending) {
                        lines.push(`- [${task.priority}] ${task.title} (${task.id})`);
                        if (task.description)
                            lines.push(`  ${task.description}`);
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
