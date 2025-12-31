import { createLogger } from "../utils/logger.js";
import { contentHash } from "../utils/hash.js";
import type {
  ContextItem,
  ContextAddPayload,
  ParticipantId,
  ContentRef,
} from "../protocol/types.js";

const logger = createLogger("context");

export class ContextManager {
  createContextItem(
    payload: ContextAddPayload,
    addedBy: ParticipantId
  ): ContextItem {
    const now = new Date().toISOString();

    // Generate content hash if content is provided but no ref
    let content_ref = payload.content_ref;
    if (payload.content && !content_ref) {
      const hash = contentHash(payload.content);
      content_ref = {
        hash,
        size_bytes:
          typeof payload.content === "string"
            ? Buffer.byteLength(payload.content, "utf8")
            : Buffer.byteLength(JSON.stringify(payload.content), "utf8"),
        mime_type:
          payload.content_type === "text"
            ? "text/plain"
            : "application/json",
        storage: "inline",
      };
    }

    return {
      key: payload.key,
      content_type: payload.content_type,
      content: payload.content,
      content_ref,
      visible_to: payload.visible_to,
      added_by: addedBy,
      added_at: now,
      updated_at: now,
    };
  }

  isVisibleTo(item: ContextItem, participantId: ParticipantId): boolean {
    // If no visibility restrictions, visible to all
    if (!item.visible_to || item.visible_to.length === 0) {
      return true;
    }
    return item.visible_to.includes(participantId);
  }

  filterVisibleContext(
    context: Map<string, ContextItem>,
    participantId: ParticipantId
  ): Map<string, ContextItem> {
    const visible = new Map<string, ContextItem>();
    for (const [key, item] of context) {
      if (this.isVisibleTo(item, participantId)) {
        visible.set(key, item);
      }
    }
    return visible;
  }

  updateContentRef(item: ContextItem, newRef: ContentRef): void {
    item.content_ref = newRef;
    item.updated_at = new Date().toISOString();
  }

  updateContent(item: ContextItem, newContent: string | object): void {
    item.content = newContent;

    // Update content ref hash
    const hash = contentHash(newContent);
    if (item.content_ref) {
      item.content_ref.hash = hash;
      item.content_ref.size_bytes =
        typeof newContent === "string"
          ? Buffer.byteLength(newContent, "utf8")
          : Buffer.byteLength(JSON.stringify(newContent), "utf8");
    }

    item.updated_at = new Date().toISOString();
  }
}
