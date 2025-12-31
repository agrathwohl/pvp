import { WebSocketClient } from "../src/transports/websocket.js";
import { createMessage } from "../src/protocol/messages.js";
import { ulid } from "../src/utils/ulid.js";
import type { SessionConfig } from "../src/protocol/types.js";

/**
 * Basic example showing a single human creating and joining a session
 */

const SERVER_URL = "ws://localhost:3000";
const sessionId = ulid();
const participantId = ulid();

const config: SessionConfig = {
  require_approval_for: ["file_write", "shell_execute"],
  default_gate_quorum: { type: "any", count: 1 },
  allow_forks: true,
  max_participants: 10,
  ordering_mode: "causal",
  on_participant_timeout: "skip",
  heartbeat_interval_seconds: 30,
  idle_timeout_seconds: 120,
  away_timeout_seconds: 300,
};

const client = new WebSocketClient(SERVER_URL, participantId);

client.on("connected", () => {
  console.log("Connected to server");

  // Create session
  const createMsg = createMessage("session.create", sessionId, participantId, {
    name: "Basic Session Example",
    config,
  });

  client.send(createMsg);
});

client.on("message", (message) => {
  console.log(`Received: ${message.type}`, message.payload);

  // Example: Auto-approve any gates
  if (message.type === "gate.request") {
    setTimeout(() => {
      const approveMsg = createMessage("gate.approve", sessionId, participantId, {
        gate: message.id,
        approver: participantId,
        comment: "Auto-approved",
      });
      client.send(approveMsg);
    }, 1000);
  }
});

client.on("disconnected", () => {
  console.log("Disconnected from server");
});

client.connect();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  client.close();
  process.exit(0);
});
