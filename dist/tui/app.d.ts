import type { ParticipantId } from "../protocol/types.js";
export declare function App({ serverUrl, sessionId, participantId, participantName, role, isCreator, }: {
    serverUrl: string;
    sessionId: string;
    participantId: ParticipantId;
    participantName: string;
    role: string;
    isCreator: boolean;
}): import("react/jsx-runtime").JSX.Element;
