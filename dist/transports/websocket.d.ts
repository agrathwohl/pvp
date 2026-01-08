import WebSocket from "ws";
import { EventEmitter } from "events";
import type { Transport, TransportServer } from "./base.js";
import type { AnyMessage, ParticipantId } from "../protocol/types.js";
export declare class WebSocketTransport extends EventEmitter implements Transport {
    private ws;
    private _participantId;
    private _connected;
    constructor(ws: WebSocket, participantId: ParticipantId);
    get participantId(): ParticipantId;
    send(message: AnyMessage): Promise<void>;
    onMessage(handler: (message: AnyMessage) => void): void;
    onClose(handler: () => void): void;
    close(): void;
    isConnected(): boolean;
}
export interface BridgeProxyConfig {
    bridgeHost: string;
    bridgePort: number;
}
export declare class WebSocketTransportServer extends EventEmitter implements TransportServer {
    private httpServer;
    private wss;
    private transports;
    private bridgeProxy;
    constructor(port: number, host?: string);
    /**
     * Configure bridge API proxy to forward /bridge/* requests to the local bridge service
     */
    setBridgeProxy(config: BridgeProxyConfig): void;
    /**
     * Handle HTTP requests - proxy /bridge/* to bridge service, return 404 for others
     */
    private handleHttpRequest;
    /**
     * Proxy request to local bridge service
     */
    private proxyToBridge;
    onConnection(handler: (transport: Transport) => void): void;
    broadcast(message: AnyMessage, filter?: (id: string) => boolean): void;
    close(): void;
}
export declare class WebSocketClient extends EventEmitter {
    private ws;
    private url;
    private participantId;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private _connected;
    constructor(url: string, participantId: ParticipantId);
    connect(): void;
    private attemptReconnect;
    send(message: AnyMessage): void;
    close(): void;
    isConnected(): boolean;
}
