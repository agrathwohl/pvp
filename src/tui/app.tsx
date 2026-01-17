import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useTUIStore } from "./store.js";
import type { ParticipantId } from "../protocol/types.js";
import type { TaskItem } from "./store.js";

export function App({
  serverUrl,
  sessionId,
  participantId,
  participantName,
  role,
  isCreator,
}: {
  serverUrl: string;
  sessionId: string;
  participantId: ParticipantId;
  participantName: string;
  role: string;
  isCreator: boolean;
}) {
  const { exit } = useApp();
  const {
    connected,
    messages,
    participants,
    pendingGates,
    toolProposals,
    toolOutputs,
    decisionTracking,
    mode,
    draftPrompt,
    currentThinking,
    currentResponse,
    error,
    debugLog,
    debugVisible,
    connect,
    disconnect,
    updateDraft,
    submitPrompt,
    approveGate,
    approveAllGates,
    rejectGate,
    rejectAllGates,
    setMode,
    toggleThinking,
    toggleDebug,
    toggleTasks,
    fetchDecisionTracking,
    tasksState,
    tasksVisible,
    joinNotifications,
  } = useTUIStore();

  const [targetAgent, setTargetAgent] = useState<ParticipantId>("");

  // Get message target (prefer agents, fall back to other humans)
  const getMessageTarget = () => {
    const otherParticipants = Array.from(participants.values()).filter(
      (p) => p.info.id !== participantId
    );
    const agents = otherParticipants.filter((p) => p.info.type === "agent");
    return agents.length > 0 ? agents[0] : otherParticipants[0];
  };

  // Get participant display name from ID (falls back to ID if not found)
  const getParticipantName = (id: ParticipantId): string => {
    return participants.get(id)?.info.name || id;
  };

  // Connect to session on mount or when connection params change
  useEffect(() => {
    connect(serverUrl, sessionId, participantId, participantName, role, isCreator);
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, sessionId, participantId, participantName, role, isCreator]); // connect/disconnect are stable store actions

  // Poll decision tracking state from bridge service
  useEffect(() => {
    if (!connected) return;

    // Initial fetch
    fetchDecisionTracking();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      fetchDecisionTracking();
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]); // fetchDecisionTracking is a stable store action

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    // GATE CONTROLS - Work from ANY mode when gates are pending
    if (pendingGates.size > 0) {
      const gates = Array.from(pendingGates.entries());
      const [gateId] = gates[0];

      if (input === "a") {
        approveGate(gateId);
        return;
      } else if (input === "A") {
        approveAllGates("Batch approved by user");
        return;
      } else if (input === "r") {
        rejectGate(gateId, "Rejected by user");
        return;
      } else if (input === "R") {
        rejectAllGates("Batch rejected by user");
        return;
      }
    }

    // MODE-SPECIFIC CONTROLS
    if (mode === "stream") {
      if (input === "p") {
        // Block compose mode if there are pending gates
        if (pendingGates.size > 0) {
          return;
        }
        setMode("compose");
      } else if (input === "t") {
        toggleThinking();
      } else if (input === "d") {
        toggleDebug();
      } else if (input === "g") {
        toggleTasks();
      }
    } else if (mode === "compose") {
      if (key.escape) {
        setMode("stream");
        updateDraft("");
      } else if (key.return) {
        const target = getMessageTarget();
        if (target && draftPrompt.trim().length > 0) {
          submitPrompt(target.info.id);
        }
      } else if (key.backspace || key.delete) {
        updateDraft(draftPrompt.slice(0, -1));
      } else if (!key.ctrl && !key.meta && input) {
        updateDraft(draftPrompt + input);
      }
    }
  });

  const agents = Array.from(participants.values()).filter(
    (p) => p.info.type === "agent"
  );
  const humans = Array.from(participants.values()).filter(
    (p) => p.info.type === "human"
  );

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor={pendingGates.size > 0 ? "red" : "white"} paddingX={1}>
        <Text>
          PVP Session {sessionId.slice(0, 8)}...{" "}
          {connected ? (
            <Text color="green">●</Text>
          ) : (
            <Text color="red">○</Text>
          )}{" "}
          | Participants: {participants.size}
          {pendingGates.size > 0 ? (
            <Text color="red" bold inverse> | 🚨 {pendingGates.size} GATE{pendingGates.size > 1 ? "S" : ""} PENDING </Text>
          ) : (
            <Text> | Gates: 0</Text>
          )}
        </Text>
      </Box>

      {/* Decision Tracking Status */}
      {decisionTracking.bridgeConnected && (
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text>
            <Text color="cyan">📊 Decision Tracking</Text>
            {" | "}
            Msgs: {decisionTracking.messagesSinceLastCommit}
            {" | "}
            Prompts: {decisionTracking.promptsCount}
            {" | "}
            Approvals: {decisionTracking.approvalsCount}
            {decisionTracking.toolExecutions && (
              <>
                {" | "}
                Tools: {decisionTracking.toolExecutions}
              </>
            )}
            {decisionTracking.lastCommit && (
              <>
                {" | "}
                <Text dimColor>Last: {decisionTracking.lastCommit.slice(0, 7)}</Text>
              </>
            )}
          </Text>
        </Box>
      )}

      {/* Tasks Panel - Session Goals and Tasks */}
      {tasksVisible && (tasksState.goal || tasksState.tasks.length > 0) && (
        <Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column">
          <Text bold color="magenta">🎯 Session Tasks</Text>
          {tasksState.goal && (
            <Box marginTop={0}>
              <Text>
                <Text color="yellow" bold>Goal: </Text>
                <Text>{tasksState.goal.goal}</Text>
              </Text>
            </Box>
          )}
          {tasksState.tasks.length > 0 && (
            <Box flexDirection="column" marginTop={0}>
              {tasksState.tasks.filter((t: TaskItem) => t.status === "in_progress").map((task: TaskItem) => (
                <Text key={task.id}>
                  <Text color="blue">▶ </Text>
                  <Text color="blue">{task.title}</Text>
                  <Text dimColor> [{task.priority}]</Text>
                </Text>
              ))}
              {tasksState.tasks.filter((t: TaskItem) => t.status === "pending").map((task: TaskItem) => (
                <Text key={task.id}>
                  <Text color="gray">○ </Text>
                  <Text>{task.title}</Text>
                  <Text dimColor> [{task.priority}]</Text>
                </Text>
              ))}
              {tasksState.tasks.filter((t: TaskItem) => t.status === "completed").slice(-3).map((task: TaskItem) => (
                <Text key={task.id}>
                  <Text color="green">✓ </Text>
                  <Text dimColor strikethrough>{task.title}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Recent Join Notifications */}
      {joinNotifications.length > 0 && (
        <Box paddingX={1}>
          <Text dimColor>
            <Text color="green">👋 </Text>
            {joinNotifications.slice(-3).map((n, i) => (
              <Text key={n.participantId}>
                {i > 0 && ", "}
                <Text color={n.participantType === "agent" ? "cyan" : "yellow"}>{n.participantName}</Text>
                <Text dimColor> ({n.participantType})</Text>
              </Text>
            ))}
            <Text dimColor> joined</Text>
          </Text>
        </Box>
      )}

      {/* Message Stream */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
        {error && (
          <Box>
            <Text color="red">ERROR: {error}</Text>
          </Box>
        )}

        {messages.slice(-20).map((msg, i) => (
          <Box key={i} marginY={0}>
            {msg.type === "prompt.submit" && (
              <Text>
                <Text color="blue">[{msg.sender}]</Text>: {msg.payload.content}
              </Text>
            )}
            {msg.type === "response.chunk" && (
              <Text color="gray">{msg.payload.text}</Text>
            )}
            {msg.type === "tool.propose" && (
              <Box flexDirection="column">
                <Text color="yellow">
                  🔧 Tool Proposal: <Text bold>{msg.payload.tool_name}</Text>
                </Text>
                <Text color="yellow" dimColor>
                  {" "}└─ {msg.payload.description}
                </Text>
                <Text color="yellow" dimColor>
                  {" "}└─ Risk: {msg.payload.risk_level} | Category: {msg.payload.category}
                </Text>
              </Box>
            )}
            {msg.type === "tool.execute" && (
              <Text color="green">✓ Tool approved - executing...</Text>
            )}
            {msg.type === "tool.output" && !msg.payload.complete && (
              <Text color="cyan" dimColor>
                {msg.payload.stream === "stderr" ? (
                  <Text color="red">{msg.payload.text}</Text>
                ) : (
                  msg.payload.text
                )}
              </Text>
            )}
            {msg.type === "tool.result" && (
              <Box flexDirection="column">
                <Text color={msg.payload.success ? "green" : "red"}>
                  {msg.payload.success ? "✓" : "✗"} Tool {msg.payload.success ? "completed" : "failed"}
                  {" "}({msg.payload.duration_ms}ms)
                </Text>
                {msg.payload.error && (
                  <Text color="red" dimColor>
                    {" "}└─ Error: {msg.payload.error}
                  </Text>
                )}
              </Box>
            )}
            {msg.type === "tool.approve" && (
              <Text color="green">
                ✓ Tool approved by{" "}
                <Text bold>
                  {getParticipantName(msg.payload.approver)}
                </Text>
                {msg.payload.comment && (
                  <Text dimColor> - {msg.payload.comment}</Text>
                )}
              </Text>
            )}
            {msg.type === "tool.reject" && (
              <Box flexDirection="column">
                <Text color="red">
                  ✗ Tool rejected by{" "}
                  <Text bold>
                    {getParticipantName(msg.payload.rejector)}
                  </Text>
                </Text>
                <Text color="red" dimColor>
                  {" "}└─ Reason: {msg.payload.reason}
                </Text>
                {msg.payload.suggestion && (
                  <Text color="yellow" dimColor>
                    {" "}└─ Suggestion: {msg.payload.suggestion}
                  </Text>
                )}
              </Box>
            )}
            {msg.type === "gate.request" && (
              <Text color="red">⚠️  {msg.payload.message}</Text>
            )}
            {msg.type === "gate.approve" && (
              <Text color="green">
                ✓ Gate approved by{" "}
                <Text bold>
                  {getParticipantName(msg.payload.approver)}
                </Text>
                {msg.payload.comment && (
                  <Text dimColor> - {msg.payload.comment}</Text>
                )}
              </Text>
            )}
            {msg.type === "gate.reject" && (
              <Text color="red">
                ✗ Gate rejected by{" "}
                <Text bold>
                  {getParticipantName(msg.payload.rejector)}
                </Text>
                <Text dimColor> - {msg.payload.reason}</Text>
              </Text>
            )}
            {msg.type === "gate.timeout" && (
              <Text color="yellow">
                ⏱ Gate timed out - {msg.payload.resolution} ({msg.payload.approvals_received}/{msg.payload.approvals_required} approvals)
              </Text>
            )}
          </Box>
        ))}

        {currentResponse && (
          <Box marginTop={1}>
            <Text color="cyan">Response: {currentResponse}</Text>
          </Box>
        )}
      </Box>

      {/* Current Thinking (if visible) */}
      {currentThinking && (
        <Box borderStyle="single" paddingX={1} height={8}>
          <Text dimColor italic>
            Thinking: {currentThinking}
          </Text>
        </Box>
      )}

      {/* Gate Approval Panel - ALWAYS visible when gates pending */}
      {pendingGates.size > 0 && (
        <Box borderStyle="double" borderColor="red" paddingX={1} marginY={1}>
          <Box flexDirection="column">
            <Text bold color="red" inverse>
              {" "}🚨 ACTION REQUIRED: {pendingGates.size} PENDING GATE{pendingGates.size > 1 ? "S" : ""} 🚨{" "}
            </Text>
            <Text color="red" bold>
              You MUST approve or reject before the agent can continue.
            </Text>
            <Box marginTop={1} flexDirection="column">
              {Array.from(pendingGates.entries()).map(([id, gate], index) => {
                const toolProposal = gate.request.action_type === "tool"
                  ? toolProposals.get(gate.request.action_ref)
                  : null;

                return (
                  <Box key={id} flexDirection="column" marginTop={index > 0 ? 1 : 0} borderStyle="single" borderColor="yellow" paddingX={1}>
                    <Text color="yellow" bold>
                      Gate #{index + 1}: {gate.request.message}
                    </Text>
                    <Text color="gray">
                      Action Type: {gate.request.action_type} | Ref: {gate.request.action_ref.slice(0, 12)}...
                    </Text>
                    {toolProposal && (
                      <>
                        <Text color="cyan">
                          Tool: <Text bold>{toolProposal.tool_name}</Text> ({toolProposal.category})
                        </Text>
                        <Text color={toolProposal.risk_level === "critical" ? "red" : toolProposal.risk_level === "high" ? "yellow" : "green"}>
                          Risk Level: <Text bold>{toolProposal.risk_level.toUpperCase()}</Text>
                        </Text>
                        {toolProposal.arguments.full_command && (
                          <Text color="magenta">
                            Command: <Text bold>{String(toolProposal.arguments.full_command)}</Text>
                          </Text>
                        )}
                        {toolProposal.description && (
                          <Text dimColor>
                            Description: {toolProposal.description}
                          </Text>
                        )}
                      </>
                    )}
                    <Text dimColor>
                      Approvals: {gate.approvals.length} | Rejections: {gate.rejections.length}
                    </Text>
                  </Box>
                );
              })}
            </Box>
            <Box marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
              <Text bold color="white">
                CONTROLS:{" "}
                <Text color="green">[a]</Text> approve first{" "}
                <Text color="green">[A]</Text> approve ALL{" "}
                <Text color="red">[r]</Text> reject first{" "}
                <Text color="red">[R]</Text> reject ALL
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Prompt Input */}
      {mode === "compose" && (
        <Box borderStyle="single" paddingX={1}>
          <Box flexDirection="column" width="100%">
            <Text>Composing prompt (Enter to send, Esc to cancel):</Text>
            <Text>{draftPrompt}</Text>
            <Text color="gray">
              {(() => {
                const target = getMessageTarget();
                return target
                  ? `Target: ${target.info.name} (${target.info.type})`
                  : "No other participants";
              })()}
            </Text>
          </Box>
        </Box>
      )}

      {/* Status Bar */}
      <Box borderStyle="single" borderColor={pendingGates.size > 0 ? "red" : "white"} paddingX={1}>
        <Text>
          Participants:{" "}
          {humans.map((p) => p.info.name).join(", ")}
          {" | "}
          Agents: {agents.map((p) => p.info.name).join(", ")}
          {" | "}
          Mode: {mode}
          {pendingGates.size > 0 ? (
            <>
              {" | "}
              <Text color="red" bold>⚠️ GATES: {pendingGates.size}</Text>
              {" | "}
              <Text color="green">[a]</Text>/<Text color="green">[A]</Text> approve
              {" "}
              <Text color="red">[r]</Text>/<Text color="red">[R]</Text> reject
            </>
          ) : (
            <>
              {" | "}
              Keys: [p]rompt [t]hinking [d]ebug [g]oals [Ctrl+C]quit
            </>
          )}
        </Text>
      </Box>

      {/* Debug Log */}
      {debugVisible && debugLog.length > 0 && (
        <Box borderStyle="single" borderColor="magenta" paddingX={1}>
          <Box flexDirection="column">
            <Text bold color="magenta">DEBUG LOG:</Text>
            {debugLog.map((log, i) => (
              <Text key={i} dimColor>{log}</Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
