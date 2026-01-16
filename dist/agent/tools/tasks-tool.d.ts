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
import type { SessionId, ParticipantId, MessageId, AnyMessage } from "../../protocol/types.js";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskOperation = "add" | "update" | "complete" | "remove" | "list" | "clear" | "set_goal" | "get_goal";
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
export type TaskOperationArgs = {
    operation: "add";
    title: string;
    description?: string;
    priority?: TaskPriority;
} | {
    operation: "update";
    task_id: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
} | {
    operation: "complete";
    task_id: string;
} | {
    operation: "remove";
    task_id: string;
} | {
    operation: "list";
} | {
    operation: "clear";
} | {
    operation: "set_goal";
    goal: string;
} | {
    operation: "get_goal";
};
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
export declare const TASKS_CONTEXT_KEY = "session:tasks";
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
    proposeTasksOperation(args: TaskOperationArgs, sessionId: SessionId, agentId: ParticipantId): AnyMessage;
    /**
     * Execute a tasks operation
     * Broadcasts state changes to session for persistence
     */
    executeTasksOperation(toolProposalId: MessageId, args: TaskOperationArgs, sessionId: SessionId, agentId: ParticipantId, broadcast: (msg: AnyMessage) => void): Promise<TasksExecutionResult>;
    /**
     * Get a summary of the current session state for context
     * Useful for providing the agent with awareness of goals/tasks
     */
    getContextSummary(): string;
}
export declare function createTasksToolHandler(): TasksToolHandler;
