/**
 * PVP Transport Layer - Abstract interfaces for network communication
 * @module transports/base
 */

import type { AnyMessage, ParticipantId } from "../protocol/types.js";

/**
 * Transport interface for client-side connections to a PVP server.
 * Provides bidirectional message passing with connection lifecycle management.
 *
 * @example
 * ```typescript
 * // Using WebSocketTransport (the default implementation)
 * import { WebSocketTransport } from "@agrathwohl/pvp/transports";
 *
 * const transport = new WebSocketTransport("ws://localhost:3000", "participant-123");
 * await transport.connect();
 *
 * transport.onMessage((message) => {
 *   console.log("Received:", message.type);
 * });
 *
 * await transport.send(createMessage("session.join", sessionId, participantId, payload));
 * ```
 */
export interface Transport {
  /**
   * Unique identifier for this transport's participant.
   * Set during construction and remains constant for the transport's lifetime.
   */
  readonly participantId: ParticipantId;

  /**
   * Send a protocol message to the connected server.
   * @param message - The PVP protocol message to send
   * @returns Promise that resolves when the message is sent
   * @throws Error if the transport is not connected
   */
  send(message: AnyMessage): Promise<void>;

  /**
   * Register a handler for incoming messages from the server.
   * Multiple handlers can be registered and will be called in order.
   * @param handler - Callback function invoked for each received message
   */
  onMessage(handler: (message: AnyMessage) => void): void;

  /**
   * Register a handler for connection close events.
   * Called when the connection is closed (either locally or by the server).
   * @param handler - Callback function invoked when connection closes
   */
  onClose(handler: () => void): void;

  /**
   * Close the transport connection gracefully.
   * After calling, isConnected() will return false.
   */
  close(): void;

  /**
   * Check if the transport is currently connected.
   * @returns true if connected and ready to send/receive messages
   */
  isConnected(): boolean;
}

/**
 * Server-side transport interface for handling multiple client connections.
 * Manages incoming connections and provides broadcast capabilities.
 *
 * @example
 * ```typescript
 * import { WebSocketTransportServer } from "@agrathwohl/pvp/transports";
 *
 * const server = new WebSocketTransportServer(3000, "0.0.0.0");
 *
 * server.onConnection((transport) => {
 *   console.log("New client:", transport.participantId);
 *
 *   transport.onMessage(async (message) => {
 *     // Handle message from this client
 *     await handleMessage(transport.participantId, message);
 *   });
 *
 *   transport.onClose(() => {
 *     console.log("Client disconnected:", transport.participantId);
 *   });
 * });
 * ```
 */
export interface TransportServer {
  /**
   * Register a handler for new client connections.
   * The handler receives a Transport instance for communicating with the client.
   * @param handler - Callback function invoked for each new connection
   */
  onConnection(handler: (transport: Transport) => void): void;

  /**
   * Broadcast a message to multiple connected clients.
   * @param message - The PVP protocol message to broadcast
   * @param filter - Optional function to filter recipients. Return true to include a participant.
   *                 If not provided, message is sent to all connected clients.
   *
   * @example
   * ```typescript
   * // Broadcast to all clients
   * server.broadcast(message);
   *
   * // Broadcast to specific participant only
   * server.broadcast(message, (id) => id === targetParticipantId);
   *
   * // Broadcast to all except sender
   * server.broadcast(message, (id) => id !== message.sender);
   * ```
   */
  broadcast(message: AnyMessage, filter?: (id: ParticipantId) => boolean): void;

  /**
   * Shut down the server and close all client connections.
   * After calling, no new connections will be accepted.
   */
  close(): void;
}
