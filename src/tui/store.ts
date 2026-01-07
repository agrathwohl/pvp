import { create } from "zustand";
import { WebSocketClient } from "../transports/websocket.js";
import { createMessage } from "../protocol/messages.js";
import type {
  AnyMessage,
  SessionId,
  ParticipantId,
  ParticipantState,
  ContextItem,
  GateState,
  MessageId,
  InterruptUrgency,
} from "../protocol/types.js";

export type TUIMode = "stream" | "compose" | "gate" | "thinking";

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
  // Connection
  connected: boolean;
  sessionId: SessionId | null;
  participantId: ParticipantId | null;
  client: WebSocketClient | null;
  bridgeBaseUrl: string | null;

  // Session data
  participants: Map<ParticipantId, ParticipantState>;
  messages: AnyMessage[];
  context: Map<string, ContextItem>;
  pendingGates: Map<MessageId, GateState>;

  // Tool execution
  toolProposals: Map<MessageId, ToolProposal>;
  toolOutputs: Map<MessageId, ToolOutput>;

  // Decision tracking
  decisionTracking: DecisionTrackingState;

  // UI state
  mode: TUIMode;
  draftPrompt: string;
  currentThinking: string;
  currentResponse: string;
  thinkingVisible: boolean;
  error: string | null;
  debugLog: string[];
  debugVisible: boolean;

  // Actions
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
  setError: (error: string | null) => void;
  fetchDecisionTracking: () => Promise<void>;
}

export const useTUIStore = create<TUIState>((set, get) => ({
  // Initial state
  connected: false,
  sessionId: null,
  participantId: null,
  client: null,
  bridgeBaseUrl: null,
  participants: new Map(),
  messages: [],
  context: new Map(),
  pendingGates: new Map(),
  toolProposals: new Map(),
  toolOutputs: new Map(),
  decisionTracking: {
    bridgeConnected: false,
    messagesSinceLastCommit: 0,
    promptsCount: 0,
    approvalsCount: 0,
    toolExecutions: "",
    decisionSummary: null,
    lastCommit: null,
  },
  mode: "stream",
  draftPrompt: "",
  currentThinking: "",
  currentResponse: "",
  thinkingVisible: false,
  error: null,
  debugLog: [],
  debugVisible: false,

  // Actions
  connect: (url, sessionId, participantId, name, role, isCreator) => {
    const client = new WebSocketClient(url, participantId);

    // Derive bridge URL from server URL
    // ws://host:port -> http://host:port/bridge
    // wss://host:port -> https://host:port/bridge
    const bridgeBaseUrl = url
      .replace(/^ws:/, "http:")
      .replace(/^wss:/, "https:")
      .replace(/\/$/, "") + "/bridge";

    client.on("connected", () => {
      set({ connected: true, participantId, sessionId, client, bridgeBaseUrl });

      // Join or create session
      if (isCreator) {
        // Create new session
        const createMsg = createMessage("session.create", sessionId, participantId, {
          name: `${name}'s Session`,
          config: {
            require_approval_for: [],
            default_gate_quorum: { type: "any", count: 1 },
            allow_forks: true,
            max_participants: 10,
            ordering_mode: "causal",
            on_participant_timeout: "skip",
            heartbeat_interval_seconds: 30,
            idle_timeout_seconds: 120,
            away_timeout_seconds: 300,
          },
        });
        client.send(createMsg);

        // Then join as participant
        const joinMsg = createMessage("session.join", sessionId, participantId, {
          participant: {
            id: participantId,
            name,
            type: "human",
            roles: [role as any],
            capabilities: ["prompt", "approve", "add_context"],
            transport: "websocket",
          },
          supported_versions: [1],
        });
        client.send(joinMsg);
      } else {
        // Join existing session
        const joinMsg = createMessage("session.join", sessionId, participantId, {
          participant: {
            id: participantId,
            name,
            type: "human",
            roles: [role as any],
            capabilities: ["prompt", "approve", "add_context"],
            transport: "websocket",
          },
          supported_versions: [1],
        });
        client.send(joinMsg);
      }
    });

    client.on("disconnected", () => {
      set({ connected: false });
    });

    client.on("message", (message: AnyMessage) => {
      const state = get();

      // Debug logging
      const debugMsg = message.type === "participant.announce"
        ? `RECV: ${message.type} name=${message.payload.name} type=${message.payload.type}`
        : `RECV: ${message.type}`;
      const newDebugLog = [...state.debugLog, debugMsg].slice(-10);

      // Handle different message types
      switch (message.type) {
        case "participant.announce":
          state.participants.set(message.payload.id, {
            info: message.payload,
            presence: "active",
            lastHeartbeat: new Date().toISOString(),
            lastActive: new Date().toISOString(),
          });
          const updatedParticipants = new Map(state.participants);
          set({
            participants: updatedParticipants,
            debugLog: [...newDebugLog, `ADDED: ${message.payload.name} (total: ${updatedParticipants.size})`].slice(-10)
          });
          break;

        case "session.leave":
          state.participants.delete(message.sender);
          set({
            participants: new Map(state.participants),
            debugLog: [...newDebugLog, `REMOVED: ${message.sender} (total: ${state.participants.size})`].slice(-10)
          });
          break;

        case "presence.update":
          {
            const participant = state.participants.get(message.payload.participant);
            if (participant) {
              participant.presence = message.payload.status;
              participant.lastActive = message.payload.last_active;
              set({ participants: new Map(state.participants) });
            }
          }
          break;

        case "context.add":
          state.context.set(message.payload.key, {
            key: message.payload.key,
            content_type: message.payload.content_type,
            content: message.payload.content,
            content_ref: message.payload.content_ref,
            visible_to: message.payload.visible_to,
            added_by: message.sender,
            added_at: message.ts,
            updated_at: message.ts,
          });
          set({ context: new Map(state.context) });
          break;

        case "context.remove":
          state.context.delete(message.payload.key);
          set({ context: new Map(state.context) });
          break;

        case "thinking.start":
          set({ currentThinking: "", mode: "thinking" });
          break;

        case "thinking.chunk":
          set({ currentThinking: state.currentThinking + message.payload.text });
          break;

        case "thinking.end":
          // Keep thinking visible but switch back to stream mode
          set({ mode: "stream" });
          break;

        case "response.start":
          set({ currentResponse: "" });
          break;

        case "response.chunk":
          set({ currentResponse: state.currentResponse + message.payload.text });
          break;

        case "response.end":
          // Response complete
          break;

        case "gate.request":
          {
            const gate: GateState = {
              request: message.payload,
              approvals: [],
              rejections: [],
              created_at: message.ts,
              expires_at: message.payload.timeout_seconds > 0
                ? new Date(Date.now() + message.payload.timeout_seconds * 1000).toISOString()
                : null,
            };
            state.pendingGates.set(message.payload.action_ref, gate);
            set({ pendingGates: new Map(state.pendingGates), mode: "gate" });
          }
          break;

        case "gate.approve":
          {
            const gate = state.pendingGates.get(message.payload.gate);
            if (gate) {
              gate.approvals.push(message.payload.approver);
              set({ pendingGates: new Map(state.pendingGates) });
            }
          }
          break;

        case "gate.reject":
          {
            // Gate rejection removes the gate entirely (server already removed it)
            state.pendingGates.delete(message.payload.gate);
            set({ pendingGates: new Map(state.pendingGates) });
            if (state.pendingGates.size === 0) {
              set({ mode: "stream" });
            }
          }
          break;

        case "gate.timeout":
          state.pendingGates.delete(message.payload.gate);
          set({ pendingGates: new Map(state.pendingGates) });
          if (state.pendingGates.size === 0) {
            set({ mode: "stream" });
          }
          break;

        case "tool.propose":
          {
            const proposal: ToolProposal = {
              id: message.id,
              tool_name: message.payload.tool_name,
              arguments: message.payload.arguments,
              agent: message.payload.agent,
              risk_level: message.payload.risk_level,
              description: message.payload.description,
              category: message.payload.category,
            };
            state.toolProposals.set(message.id, proposal);
            set({ toolProposals: new Map(state.toolProposals) });
          }
          break;

        case "tool.output":
          {
            const proposalId = message.payload.tool_proposal;
            let output = state.toolOutputs.get(proposalId);

            if (!output) {
              output = {
                proposalId,
                stdout: "",
                stderr: "",
                complete: false,
              };
              state.toolOutputs.set(proposalId, output);
            }

            if (message.payload.stream === "stdout") {
              output.stdout += message.payload.text;
            } else if (message.payload.stream === "stderr") {
              output.stderr += message.payload.text;
            }

            output.complete = message.payload.complete;
            set({ toolOutputs: new Map(state.toolOutputs) });
          }
          break;

        case "tool.result":
          {
            const proposalId = message.payload.tool_proposal;
            let output = state.toolOutputs.get(proposalId);

            if (!output) {
              output = {
                proposalId,
                stdout: "",
                stderr: "",
                complete: true,
              };
              state.toolOutputs.set(proposalId, output);
            }

            const shellResult = message.payload.result as { exitCode?: number; stdout?: string; stderr?: string } | undefined;
            output.result = {
              success: message.payload.success,
              exitCode: shellResult?.exitCode,
              error: message.payload.error,
              duration_ms: message.payload.duration_ms,
            };
            output.complete = true;
            set({ toolOutputs: new Map(state.toolOutputs) });
          }
          break;

        case "tool.execute":
          {
            const gate = state.pendingGates.get(message.payload.tool_proposal);
            if (gate) {
              state.pendingGates.delete(message.payload.tool_proposal);
              set({ pendingGates: new Map(state.pendingGates) });
              if (state.pendingGates.size === 0) {
                set({ mode: "stream" });
              }
            }
          }
          break;

        case "error":
          set({ error: message.payload.message, debugLog: [...newDebugLog, `ERROR: ${message.payload.message}`].slice(-10) });
          break;

        default:
          set({ debugLog: newDebugLog });
          break;
      }

      // Add to message log
      set({ messages: [...state.messages, message] });
    });

    client.connect();
  },

  disconnect: () => {
    const { client } = get();
    if (client) {
      client.close();
    }
    set({
      connected: false,
      client: null,
      sessionId: null,
      participantId: null,
      bridgeBaseUrl: null,
      participants: new Map(),
      messages: [],
      context: new Map(),
      pendingGates: new Map(),
      toolProposals: new Map(),
      toolOutputs: new Map(),
    });
  },

  sendMessage: (message) => {
    const { client } = get();
    if (client && client.isConnected()) {
      client.send(message);
    }
  },

  setMode: (mode) => {
    set({ mode });
  },

  updateDraft: (content) => {
    set({ draftPrompt: content });
  },

  submitPrompt: (targetAgent) => {
    const { draftPrompt, sessionId, participantId, sendMessage } = get();
    if (!sessionId || !participantId) return;

    const message = createMessage("prompt.submit", sessionId, participantId, {
      content: draftPrompt,
      target_agent: targetAgent,
      contributors: [participantId],
      context_keys: [],
    });

    sendMessage(message);
    set({ draftPrompt: "", mode: "stream" });
  },

  approveGate: (gateId, comment) => {
    const { sessionId, participantId, sendMessage } = get();
    if (!sessionId || !participantId) return;

    const message = createMessage("gate.approve", sessionId, participantId, {
      gate: gateId,
      approver: participantId,
      comment,
    });

    sendMessage(message);
  },

  approveAllGates: (comment) => {
    const { sessionId, participantId, sendMessage, pendingGates } = get();
    if (!sessionId || !participantId) return;

    // Approve all pending gates
    for (const [gateId] of pendingGates) {
      const message = createMessage("gate.approve", sessionId, participantId, {
        gate: gateId,
        approver: participantId,
        comment,
      });
      sendMessage(message);
    }
  },

  rejectGate: (gateId, reason) => {
    const { sessionId, participantId, sendMessage } = get();
    if (!sessionId || !participantId) return;

    const message = createMessage("gate.reject", sessionId, participantId, {
      gate: gateId,
      rejector: participantId,
      reason,
    });

    sendMessage(message);
  },

  rejectAllGates: (reason) => {
    const { sessionId, participantId, sendMessage, pendingGates } = get();
    if (!sessionId || !participantId) return;

    // Reject all pending gates
    for (const [gateId] of pendingGates) {
      const message = createMessage("gate.reject", sessionId, participantId, {
        gate: gateId,
        rejector: participantId,
        reason,
      });
      sendMessage(message);
    }
  },

  raiseInterrupt: (urgency, message, targetAgent) => {
    const { sessionId, participantId, sendMessage } = get();
    if (!sessionId || !participantId) return;

    const interruptMsg = createMessage("interrupt.raise", sessionId, participantId, {
      target: targetAgent,
      urgency,
      message,
    });

    sendMessage(interruptMsg);
  },

  toggleThinking: () => {
    set((state) => ({ thinkingVisible: !state.thinkingVisible }));
  },

  toggleDebug: () => {
    set((state) => ({ debugVisible: !state.debugVisible }));
  },

  setError: (error) => {
    set({ error });
  },

  fetchDecisionTracking: async () => {
    const { bridgeBaseUrl } = get();
    if (!bridgeBaseUrl) {
      // Not connected yet, skip
      return;
    }

    try {
      const response = await fetch(`${bridgeBaseUrl}/commit-context`);
      if (response.ok) {
        const data = await response.json();
        set({
          decisionTracking: {
            bridgeConnected: true,
            messagesSinceLastCommit: data.messages_since_last_commit || 0,
            promptsCount: data.prompts_count || 0,
            approvalsCount: data.approvals_count || 0,
            toolExecutions: data.tool_executions || "",
            decisionSummary: data.decision_summary || null,
            lastCommit: data.last_commit || null,
          },
        });
      } else {
        set((state) => ({
          decisionTracking: { ...state.decisionTracking, bridgeConnected: false },
        }));
      }
    } catch {
      set((state) => ({
        decisionTracking: { ...state.decisionTracking, bridgeConnected: false },
      }));
    }
  },
}));
