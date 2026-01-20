import { WebSocketClient } from "../transports/websocket.js";
import type { AnyMessage, SessionId, ParticipantId, ParticipantState, ContextItem, GateState, MessageId, InterruptUrgency } from "../protocol/types.js";
export type TUIMode = "stream" | "compose" | "gate" | "thinking";
export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    status: "pending" | "in_progress" | "completed";
    priority: "low" | "medium" | "high";
    created_at: string;
    updated_at: string;
    completed_at?: string;
}
export interface SessionGoal {
    goal: string;
    set_at: string;
    set_by: string;
}
export interface TasksState {
    goal: SessionGoal | null;
    tasks: TaskItem[];
}
export interface JoinNotification {
    participantId: string;
    participantName: string;
    participantType: "human" | "agent";
    roles: string[];
    timestamp: string;
    agentResponse?: string;
}
export interface MentionRoutingInfo {
    messageId: string;
    wasIgnored: boolean;
    targetParticipant?: string;
    mentionContext?: string;
}
export interface PendingInterrupt {
    id: MessageId;
    urgency: "pause" | "stop" | "emergency";
    message: string;
    target?: ParticipantId;
    raisedAt: string;
    acknowledged: boolean;
    acknowledgement?: {
        by: ParticipantId;
        action: "paused" | "stopped" | "acknowledged" | "ignored";
        reason?: string;
    };
}
export interface ToolProposal {
    id: MessageId;
    tool_name: string;
    arguments: Record<string, unknown>;
    agent: ParticipantId;
    risk_level: string;
    description: string;
    category: string;
}
export interface ToolOutput {
    proposalId: MessageId;
    stdout: string;
    stderr: string;
    complete: boolean;
    result?: {
        success: boolean;
        exitCode?: number;
        error?: string;
        duration_ms?: number;
    };
}
export interface DecisionTrackingState {
    bridgeConnected: boolean;
    messagesSinceLastCommit: number;
    promptsCount: number;
    approvalsCount: number;
    toolExecutions: string;
    decisionSummary: string | null;
    lastCommit: string | null;
}
export interface TUIState {
    connected: boolean;
    sessionId: SessionId | null;
    participantId: ParticipantId | null;
    client: WebSocketClient | null;
    bridgeBaseUrl: string | null;
    participants: Map<ParticipantId, ParticipantState>;
    messages: AnyMessage[];
    context: Map<string, ContextItem>;
    pendingGates: Map<MessageId, GateState>;
    toolProposals: Map<MessageId, ToolProposal>;
    toolOutputs: Map<MessageId, ToolOutput>;
    decisionTracking: DecisionTrackingState;
    tasksState: TasksState;
    tasksVisible: boolean;
    joinNotifications: JoinNotification[];
    mentionRouting: Map<MessageId, MentionRoutingInfo>;
    lastIgnoredMention: MentionRoutingInfo | null;
    mode: TUIMode;
    draftPrompt: string;
    currentThinking: string;
    currentResponse: string;
    thinkingVisible: boolean;
    error: string | null;
    debugLog: string[];
    debugVisible: boolean;
    connect: (url: string, sessionId: string, participantId: ParticipantId, name: string, role: string, isCreator: boolean) => void;
    disconnect: () => void;
    sendMessage: (message: AnyMessage) => void;
    setMode: (mode: TUIMode) => void;
    updateDraft: (content: string) => void;
    submitPrompt: (targetAgent: ParticipantId) => void;
    approveGate: (gateId: MessageId, comment?: string) => void;
    approveAllGates: (comment?: string) => void;
    rejectGate: (gateId: MessageId, reason: string) => void;
    rejectAllGates: (reason: string) => void;
    raiseInterrupt: (urgency: InterruptUrgency, message: string, targetAgent?: ParticipantId) => void;
    toggleThinking: () => void;
    toggleDebug: () => void;
    toggleTasks: () => void;
    setError: (error: string | null) => void;
    fetchDecisionTracking: () => Promise<void>;
}
export declare const useTUIStore: import("zustand").UseBoundStore<import("zustand").StoreApi<TUIState>>;
