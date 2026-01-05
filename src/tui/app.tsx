import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useTUIStore } from "./store.js";
import type { ParticipantId } from "../protocol/types.js";

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
    mode,
    draftPrompt,
    currentThinking,
    currentResponse,
    error,
    debugLog,
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

  useEffect(() => {
    connect(serverUrl, sessionId, participantId, participantName, role, isCreator);
    return () => {
      disconnect();
    };
  }, [serverUrl, sessionId, participantId, participantName, role, isCreator]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (mode === "stream") {
      if (input === "p") {
        // Block compose mode if there are pending gates
        if (pendingGates.size > 0) {
          // Don't allow new prompts while gates are pending
          return;
        }
        setMode("compose");
      } else if (input === "t") {
        toggleThinking();
      }
    } else if (mode === "compose") {
      if (key.escape) {
        setMode("stream");
        updateDraft("");
      } else if (key.return) {
        // Any Enter key sends the message
        const target = getMessageTarget();
        if (target && draftPrompt.trim().length > 0) {
          submitPrompt(target.info.id);
        }
      } else if (key.backspace || key.delete) {
        updateDraft(draftPrompt.slice(0, -1));
      } else if (!key.ctrl && !key.meta && input) {
        updateDraft(draftPrompt + input);
      }
    } else if (mode === "gate") {
      const gates = Array.from(pendingGates.entries());
      if (gates.length > 0) {
        const [gateId] = gates[0];
        if (input === "a") {
          // Approve single gate
          approveGate(gateId);
        } else if (input === "A") {
          // Accept ALL pending gates
          approveAllGates("Batch approved by user");
        } else if (input === "r") {
          // Reject single gate
          rejectGate(gateId, "Rejected by user");
        } else if (input === "R") {
          // Reject ALL pending gates
          rejectAllGates("Batch rejected by user");
        }
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
      <Box borderStyle="single" paddingX={1}>
        <Text>
          PVP Session {sessionId.slice(0, 8)}...{" "}
          {connected ? (
            <Text color="green">●</Text>
          ) : (
            <Text color="red">○</Text>
          )}{" "}
          | Participants: {participants.size} | Gates: {pendingGates.size}
        </Text>
      </Box>

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
            {msg.type === "gate.request" && (
              <Text color="red">⚠️  {msg.payload.message}</Text>
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

      {/* Gate Prompt */}
      {mode === "gate" && pendingGates.size > 0 && (
        <Box borderStyle="double" borderColor="yellow" paddingX={1}>
          <Box flexDirection="column">
            <Text bold color="yellow">
              ⚠️  {pendingGates.size} PENDING GATE{pendingGates.size > 1 ? "S" : ""} - Must approve/reject before continuing
            </Text>
            {Array.from(pendingGates.entries()).map(([id, gate], index) => {
              // Find the associated tool proposal if this is a tool gate
              const toolProposal = gate.request.action_type === "tool"
                ? toolProposals.get(gate.request.action_ref)
                : null;

              return (
                <Box key={id} flexDirection="column" marginTop={index > 0 ? 1 : 0}>
                  <Text color="yellow">
                    [{index + 1}] {gate.request.message}
                  </Text>
                  {toolProposal && (
                    <>
                      <Text color="yellow" dimColor>
                        {" "}└─ Tool: {toolProposal.tool_name} ({toolProposal.category}) | Risk: {toolProposal.risk_level}
                      </Text>
                      {toolProposal.arguments.full_command && (
                        <Text color="cyan" dimColor>
                          {" "}└─ Command: {String(toolProposal.arguments.full_command)}
                        </Text>
                      )}
                    </>
                  )}
                </Box>
              );
            })}
            <Box marginTop={1}>
              <Text bold>
                [a]pprove one | [A]ccept ALL | [r]eject one | [R]eject ALL
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
      <Box borderStyle="single" paddingX={1}>
        <Text>
          Participants:{" "}
          {humans.map((p) => p.info.name).join(", ")}
          {" | "}
          Agents: {agents.map((p) => p.info.name).join(", ")}
          {" | "}
          Mode: {mode}
          {" | "}
          Keys: [p]rompt [t]hinking [Ctrl+C]quit
        </Text>
      </Box>

      {/* Debug Log */}
      {debugLog.length > 0 && (
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
