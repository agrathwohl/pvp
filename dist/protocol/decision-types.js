/**
 * PVP Decision Tracking Protocol - Git Integration Types
 *
 * This module extends the Pair Vibecoding Protocol (PVP) to enable
 * git-based decision tracking. It creates a bidirectional mapping between
 * PVP's message-based conversation protocol and git's commit-based
 * version control system.
 *
 * Key Design Principles:
 * 1. Every git commit can link back to the PVP conversation that produced it
 * 2. Decision trees map to git branches, enabling exploration replay
 * 3. Tool executions are captured for auditability and learning
 * 4. Confidence scores enable post-hoc analysis of AI decision quality
 */
// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================
/** Validate a string is a valid GitSha */
export function isGitSha(value) {
    return /^[a-f0-9]{40}$/.test(value);
}
/** Validate a string is a valid GitBranchRef */
export function isGitBranchRef(value) {
    // Simplified validation - real git ref validation is more complex
    return /^[a-zA-Z0-9_\-/.]+$/.test(value) && !value.includes('..');
}
/** Convert confidence score to confidence level */
export function scoreToConfidenceLevel(score) {
    if (score < 0.2)
        return 'very_low';
    if (score < 0.4)
        return 'low';
    if (score < 0.6)
        return 'medium';
    if (score < 0.8)
        return 'high';
    return 'very_high';
}
/** Generate a DecisionCommitId */
export function generateDecisionCommitId() {
    return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/** Generate a ConversationThreadId */
export function generateConversationThreadId() {
    return `thr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/** Generate a DecisionTreeId */
export function generateDecisionTreeId() {
    return `tree_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
