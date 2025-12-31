import { WebSocketClient } from "../src/transports/websocket.js";
import { createMessage } from "../src/protocol/messages.js";
import { ulid } from "../src/utils/ulid.js";
import type { SessionConfig } from "../src/protocol/types.js";

/**
 * Example showing multiple participants collaborating in a session
 * Run this after starting the server to simulate multiple humans
 */

const SERVER_URL = "ws://localhost:3000";
const sessionId = process.argv[2] || ulid();
const isCreator = !process.argv[2];

const config: SessionConfig = {
  require_approval_for: ["file_write", "shell_execute"],
  default_gate_quorum: { type: "any", count: 2 }, // Require 2 approvals
  allow_forks: true,
  max_participants: 10,
  ordering_mode: "causal",
  on_participant_timeout: "skip",
  heartbeat_interval_seconds: 30,
  idle_timeout_seconds: 120,
  away_timeout_seconds: 300,
};

function createParticipant(name: string, role: "driver" | "navigator" | "approver") {
  const participantId = ulid();
  const client = new WebSocketClient(SERVER_URL, participantId);

  client.on("connected", () => {
    console.log(`[${name}] Connected to server`);

    if (isCreator) {
      // Create session
      const createMsg = createMessage("session.create", sessionId, participantId, {
        name: "Multi-Participant Collaboration",
        config,
      });
      client.send(createMsg);
      console.log(`[${name}] Created session: ${sessionId}`);
    } else {
      // Join existing session
      const joinMsg = createMessage("session.join", sessionId, participantId, {
        participant: {
          id: participantId,
          name,
          type: "human",
          roles: [role],
          capabilities: ["prompt", "approve", "add_context"],
          transport: "websocket",
        },
        supported_versions: [1],
      });
      client.send(joinMsg);
      console.log(`[${name}] Joined session: ${sessionId}`);
    }
  });

  client.on("message", (message) => {
    console.log(`[${name}] ${message.type}:`, JSON.stringify(message.payload, null, 2));

    // Participants with approver role auto-approve gates
    if (role === "approver" && message.type === "gate.request") {
      setTimeout(() => {
        const approveMsg = createMessage("gate.approve", sessionId, participantId, {
          gate: message.id,
          approver: participantId,
          comment: `Approved by ${name}`,
        });
        client.send(approveMsg);
        console.log(`[${name}] Approved gate: ${message.id}`);
      }, 2000);
    }
  });

  client.on("disconnected", () => {
    console.log(`[${name}] Disconnected from server`);
  });

  client.connect();

  return { client, participantId };
}

// Create participants
const alice = createParticipant("Alice", "driver");
const bob = createParticipant("Bob", "navigator");
const charlie = createParticipant("Charlie", "approver");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down all participants...");
  alice.client.close();
  bob.client.close();
  charlie.client.close();
  process.exit(0);
});

console.log(`
Multi-Participant Example
========================
Session ID: ${sessionId}

Participants:
- Alice (driver)
- Bob (navigator)
- Charlie (approver)

Gates require 2 approvals
`);
