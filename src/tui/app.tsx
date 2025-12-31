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
    rejectGate,
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
          approveGate(gateId);
        } else if (input === "r") {
          rejectGate(gateId, "Rejected by user");
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
              <Text color="yellow">
                🔧 {msg.payload.tool_name} ({msg.payload.category})
              </Text>
            )}
            {msg.type === "tool.execute" && (
              <Text color="green">✓ Tool approved and executing</Text>
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
          {Array.from(pendingGates.entries()).slice(0, 1).map(([id, gate]) => (
            <Box key={id} flexDirection="column">
              <Text bold color="yellow">
                GATE: {gate.request.message}
              </Text>
              <Text>
                [a]pprove | [r]eject
              </Text>
            </Box>
          ))}
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
