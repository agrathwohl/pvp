import { createHash } from "crypto";
export function sha256(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function contentHash(content) {
    const data = typeof content === "string" ? content : JSON.stringify(content);
    return sha256(data);
}
