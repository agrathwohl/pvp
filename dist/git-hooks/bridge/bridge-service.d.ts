/**
 * PVP Git Bridge Service
 * Local daemon that maintains session state for git hooks
 * Exposes Unix socket and HTTP API for hook communication
 */
import type { PvpGitConfig, ParticipantInfo } from "./types.js";
import type { AnyMessage, SessionId } from "../../protocol/types.js";
export declare class PvpGitBridgeService {
    private config;
    private state;
    private socketServer;
    private httpServer;
    private startTime;
    private messagesProcessed;
    private commitsTracked;
    private recentCommits;
    private connections;
    constructor(config?: Partial<PvpGitConfig>);
    private createEmptyState;
    start(): Promise<void>;
    stop(): Promise<void>;
    private startSocketServer;
    private startHttpServer;
    private handleSocketRequest;
    private handleHttpRequest;
    private handleHttpGet;
    private handleHttpPost;
    private processRequest;
    private getCommitContext;
    private getExtendedMetadata;
    private getStatus;
    private getCommits;
    private handleCommitCreated;
    private handleSessionStarted;
    private handleSessionEnded;
    private handleMessageReceived;
    private handleResetContext;
    private trackToolExecution;
    private updateToolExecution;
    private summarizeMessage;
    private updateDecisionSummary;
    private loadPersistedState;
    private persistState;
    private triggerWebhooks;
    private signPayload;
    /**
     * Called when PVP server receives a message
     */
    onMessage(message: AnyMessage): void;
    /**
     * Called when a new session starts
     */
    onSessionStart(sessionId: SessionId, participants: ParticipantInfo[]): void;
    /**
     * Called when a session ends
     */
    onSessionEnd(sessionId: SessionId): void;
    /**
     * Called when a participant joins/leaves
     */
    updateParticipants(participants: ParticipantInfo[]): void;
}
