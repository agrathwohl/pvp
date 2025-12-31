import WebSocket, { WebSocketServer } from "ws";
import { EventEmitter } from "events";
import { createLogger } from "../utils/logger.js";
import { serializeMessage, deserializeMessage } from "../protocol/messages.js";
import type { Transport, TransportServer } from "./base.js";
import type { AnyMessage, ParticipantId } from "../protocol/types.js";

const logger = createLogger("websocket");

export class WebSocketTransport extends EventEmitter implements Transport {
  private ws: WebSocket;
  private _participantId: ParticipantId;
  private _connected: boolean = false;

  constructor(ws: WebSocket, participantId: ParticipantId) {
    super();
    this.ws = ws;
    this._participantId = participantId;
    this._connected = true;

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const message = deserializeMessage(data.toString());
        this.emit("message", message);
      } catch (error) {
        logger.error({ error, participantId }, "Failed to deserialize message");
      }
    });

    this.ws.on("close", () => {
      this._connected = false;
      this.emit("close");
    });

    this.ws.on("error", (error) => {
      logger.error({ error, participantId }, "WebSocket error");
    });
  }

  get participantId(): ParticipantId {
    return this._participantId;
  }

  async send(message: AnyMessage): Promise<void> {
    if (!this._connected) {
      throw new Error("WebSocket not connected");
    }

    const data = serializeMessage(message);
    this.ws.send(data);
  }

  onMessage(handler: (message: AnyMessage) => void): void {
    this.on("message", handler);
  }

  onClose(handler: () => void): void {
    this.on("close", handler);
  }

  close(): void {
    this._connected = false;
    this.ws.close();
  }

  isConnected(): boolean {
    return this._connected && this.ws.readyState === WebSocket.OPEN;
  }
}

export class WebSocketTransportServer extends EventEmitter implements TransportServer {
  private wss: WebSocketServer;
  private transports: Map<ParticipantId, WebSocketTransport> = new Map();

  constructor(port: number, host: string = "0.0.0.0") {
    super();

    this.wss = new WebSocketServer({ port, host });

    this.wss.on("connection", (ws: WebSocket) => {
      logger.info("New WebSocket connection");

      // Wait for first message to determine participant ID
      const onFirstMessage = (data: WebSocket.RawData) => {
        try {
          const message = deserializeMessage(data.toString());
          const participantId = message.sender;

          // Create transport
          const transport = new WebSocketTransport(ws, participantId);
          this.transports.set(participantId, transport);

          // Remove first message listener
          ws.off("message", onFirstMessage);

          // Emit connection event
          this.emit("connection", transport);

          // Re-emit the first message through the transport
          transport.emit("message", message);

          // Handle cleanup on close
          transport.on("close", () => {
            this.transports.delete(participantId);
          });
        } catch (error) {
          logger.error({ error }, "Failed to process first message");
          ws.close();
        }
      };

      ws.on("message", onFirstMessage);
    });

    logger.info({ port, host }, "WebSocket server started");
  }

  onConnection(handler: (transport: Transport) => void): void {
    this.on("connection", handler);
  }

  broadcast(message: AnyMessage, filter?: (id: string) => boolean): void {
    const data = serializeMessage(message);

    for (const [participantId, transport] of this.transports) {
      if (!filter || filter(participantId)) {
        if (transport.isConnected()) {
          transport.send(message).catch((error) => {
            logger.error({ error, participantId }, "Failed to broadcast message");
          });
        }
      }
    }
  }

  close(): void {
    for (const transport of this.transports.values()) {
      transport.close();
    }
    this.transports.clear();
    this.wss.close();
    logger.info("WebSocket server closed");
  }
}

// Client-side WebSocket transport with reconnection
export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private participantId: ParticipantId;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private _connected = false;

  constructor(url: string, participantId: ParticipantId) {
    super();
    this.url = url;
    this.participantId = participantId;
  }

  connect(): void {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.on("open", () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      logger.info({ url: this.url, participantId: this.participantId }, "Connected");
      this.emit("connected");
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const message = deserializeMessage(data.toString());
        this.emit("message", message);
      } catch (error) {
        logger.error({ error }, "Failed to deserialize message");
      }
    });

    this.ws.on("close", () => {
      this._connected = false;
      this.ws = null;
      this.emit("disconnected");
      this.attemptReconnect();
    });

    this.ws.on("error", (error) => {
      logger.error({ error }, "WebSocket client error");
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info({ attempt: this.reconnectAttempts, delay }, "Attempting reconnect");

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(message: AnyMessage): void {
    if (!this.ws || !this._connected) {
      throw new Error("Not connected");
    }

    const data = serializeMessage(message);
    this.ws.send(data);
  }

  close(): void {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
