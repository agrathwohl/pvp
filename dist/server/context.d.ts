import type { ContextItem, ContextAddPayload, ParticipantId, ContentRef } from "../protocol/types.js";
export declare class ContextManager {
    createContextItem(payload: ContextAddPayload, addedBy: ParticipantId): ContextItem;
    isVisibleTo(item: ContextItem, participantId: ParticipantId): boolean;
    filterVisibleContext(context: Map<string, ContextItem>, participantId: ParticipantId): Map<string, ContextItem>;
    updateContentRef(item: ContextItem, newRef: ContentRef): void;
    updateContent(item: ContextItem, newContent: string | object): void;
}
