# PVP Decision Tracking Architecture

**Version**: 1.0.0
**Status**: Complete
**Date**: 2026-01-06

## Executive Summary

This document describes the complete architecture for extending PVP (Pair Vibecoding Protocol) with git-based decision tracking. The system transforms git from a pure "what changed" tool into a "why did we change it" tool, creating an auditable, queryable decision history that reveals the story behind every commit.

**Core Philosophy**: *"The code is a side effect; the real artifact is the recorded, auditable stream of human decisions mediated by AI execution."*

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PVP DECISION TRACKING                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   PVP Session    │───▶│  Bridge Service  │───▶│   Git Hooks      │  │
│  │                  │    │                  │    │                  │  │
│  │  • Messages      │    │  • State mgmt    │    │  • prepare-msg   │  │
│  │  • Forks         │    │  • Socket API    │    │  • post-commit   │  │
│  │  • Gates         │    │  • HTTP API      │    │  • pre-push      │  │
│  │  • Tools         │    │  • Webhooks      │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│           │                       │                       │             │
│           ▼                       ▼                       ▼             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         GIT STORAGE LAYERS                        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │  Layer 1: Commit Trailers     │  PVP-Session, PVP-Confidence...   │  │
│  │  Layer 2: Git Notes           │  refs/notes/pvp/* (rich JSON)     │  │
│  │  Layer 3: Custom Refs         │  refs/pvp/sessions/, decisions/   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │                                                             │
│           ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         QUERY & VISUALIZATION                      │  │
│  │  • pvp-log (enhanced git log)  • Decision tree traversal          │  │
│  │  • Session replay              • Confidence analytics             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Index

### Created Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/protocol/decision-types.ts` | TypeScript types for git integration | ~600 |
| `docs/GIT_COMMIT_PROTOCOL.md` | Commit message format specification | ~500 |
| `src/git-hooks/hooks/prepare-commit-msg` | Inject PVP metadata into commits | ~150 |
| `src/git-hooks/hooks/post-commit` | Store extended metadata in git-notes | ~120 |
| `src/git-hooks/hooks/pre-push` | Validate PVP metadata coverage | ~100 |
| `src/git-hooks/bridge/types.ts` | Bridge service type definitions | ~200 |
| `src/git-hooks/bridge/bridge-service.ts` | Bridge service implementation | ~700 |
| `src/git-hooks/pvp-git.config.schema.json` | Configuration JSON schema | ~50 |
| `src/git-hooks/pvp-git.config.example.json` | Example configuration | ~30 |
| `src/git-hooks/install.sh` | Hook installation script | ~50 |

---

## Data Flow

### 1. Session Start → Commit

```
Human: "Implement JWT validation"
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  PVP SESSION                                                     │
│                                                                  │
│  msg-01: prompt.submit "Implement JWT validation"                │
│  msg-02: response.thinking (AI reasoning)                        │
│  msg-03: tool.propose (write_file src/auth/jwt.ts)              │
│  msg-04: gate.approve (human:alice)                             │
│  msg-05: tool.result (success)                                  │
│  msg-06: response.end "Implementation complete"                  │
└─────────────────────────────────────────────────────────────────┘
    │
    │  Bridge Service captures:
    │  • Session ID
    │  • Message chain
    │  • Tool executions
    │  • Approvals
    │  • Decision context
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  git commit                                                      │
│                                                                  │
│  feat(auth): implement JWT validation [pvp:msg-01]              │
│                                                                  │
│  <body with rationale>                                          │
│                                                                  │
│  PVP-Session: ses_abc123                                        │
│  PVP-Messages: msg-01,msg-03,msg-05,msg-06                      │
│  PVP-Confidence: 0.90                                           │
│  Decision-By: human:alice,ai:claude                             │
└─────────────────────────────────────────────────────────────────┘
    │
    │  post-commit hook attaches:
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  refs/notes/pvp                                                  │
│  {                                                               │
│    "conversation": [...full message thread...],                  │
│    "tools": [...tool execution details...],                      │
│    "alternatives": [...branches considered...],                  │
│    "metrics": { tokens, latency, etc. }                         │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2. PVP Fork → Git Branch

```
┌─────────────────────────────────────────────────────────────────┐
│  PVP: fork.create "try-oauth2"                                  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Git: git checkout -b pvp/fork-try-oauth2                       │
│                                                                  │
│  refs/pvp/forks/try-oauth2 → {                                  │
│    "pvp_fork_id": "fork-try-oauth2",                            │
│    "purpose": "Explore OAuth2 as auth alternative",             │
│    "parent_branch": "main",                                      │
│    "created_by": "human:alice",                                 │
│    "status": "active"                                           │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3. PVP Merge → Git Merge

```
┌─────────────────────────────────────────────────────────────────┐
│  PVP: merge.execute { source: "fork-oauth2", target: "trunk" }  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Git: git merge pvp/fork-oauth2                                 │
│                                                                  │
│  Merge commit trailers include:                                  │
│  PVP-Fork: fork-oauth2                                          │
│  PVP-Decision-Type: merge-resolution                            │
│  Decision-By: human:alice,human:bob,ai:claude                   │
│                                                                  │
│  Git note includes conflict resolution decisions                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Type Definitions

### DecisionCommit

The `DecisionCommit` is the centerpiece type that links git commits to PVP conversations:

```typescript
interface DecisionCommit {
  // Git linkage
  git_sha: GitSha;
  git_branch: GitBranchRef;
  git_parents: GitSha[];

  // PVP linkage
  pvp_session: SessionId;
  pvp_messages: MessageId[];
  initiating_prompt: MessageId;

  // Decision metadata
  decision_summary: string;
  decision_type: DecisionType;
  confidence_score: number;  // 0.0-1.0

  // AI reasoning capture
  alternatives_considered: AlternativeApproach[];
  assumptions: Assumption[];
  risks: Risk[];

  // Tool execution log
  tool_executions: ToolExecution[];

  // Validation
  approvals: Approval[];
  files_changed: FileChange[];
}
```

### DecisionTree

Maps PVP session structure to git branch topology:

```typescript
interface DecisionTree {
  pvp_session: SessionId;
  root_commit: GitSha;
  trunk_branch: GitBranchRef;

  // Bidirectional mappings
  fork_branch_map: Map<ForkId, GitBranchRef>;
  message_commit_map: Map<MessageId, DecisionCommitId>;

  branches: DecisionBranch[];
  merge_points: DecisionMerge[];
}
```

### ConversationThread

Serializable format for git-notes storage:

```typescript
interface ConversationThread {
  messages: CompactMessage[];
  participants: ThreadParticipant[];

  storage: {
    method: 'git_notes' | 'trailer' | 'external';
    compressed: boolean;
    detail_level: 'full' | 'summary' | 'minimal';
  };
}
```

---

## Storage Architecture

### Layer 1: Commit Trailers (Lightweight)

Always present in commit messages:

```
PVP-Session: ses_abc123def456
PVP-Messages: msg-01,msg-05,msg-12
PVP-Confidence: 0.85
PVP-Decision-Type: implementation
Decision-By: human:alice,ai:claude
```

**Purpose**: Quick lookup, compatible with `git log --format='%(trailers)'`

### Layer 2: Git Notes (Rich Data)

Namespaced notes for structured JSON:

```bash
# Decision context
git notes --ref=pvp/decisions show HEAD

# Tool execution log
git notes --ref=pvp/tools show HEAD

# Full conversation
git notes --ref=pvp/conversation show HEAD
```

**Purpose**: Full audit trail, queryable structured data

### Layer 3: Custom Refs (Session State)

Long-lived references for session metadata:

```
refs/pvp/sessions/<session_id>   → Session state JSON blob
refs/pvp/decisions/<decision_id> → Decision node
refs/pvp/trees/<tree_id>         → Decision tree structure
```

**Purpose**: Cross-commit relationships, session continuity

---

## Bridge Service

The `PvpGitBridgeService` maintains live session state and provides APIs for git hooks:

### Communication Channels

1. **Unix Socket** (primary): `/tmp/pvp-git-bridge.sock`
2. **HTTP API** (fallback): `http://localhost:9847`
3. **State File** (offline): `.pvp/current-session.json`

### API Endpoints

```typescript
// Socket/HTTP protocol
interface BridgeRequest {
  action: 'get_context' | 'notify_commit' | 'get_messages' | 'health';
  commit_sha?: string;
  message_ids?: string[];
}

interface BridgeResponse {
  status: 'ok' | 'error';
  data: GitSessionState | CommitNotification | MessageContent[];
}
```

### Integration Points

```typescript
class PvpGitBridgeService {
  // Called by PVP server on message events
  onMessage(message: AnyMessage): void;
  onSessionStart(sessionId: SessionId, participants: ParticipantInfo[]): void;
  onSessionEnd(sessionId: SessionId): void;

  // Called by git hooks
  getCommitContext(): GitSessionState;
  notifyCommit(sha: string): void;
}
```

---

## Git Hooks

### prepare-commit-msg

**Timing**: Before commit message editor opens
**Purpose**: Inject PVP trailers from active session

```bash
#!/bin/sh
# Query bridge for session context
CONTEXT=$(pvp_query_socket || pvp_read_state_file || pvp_query_http)

# Inject trailers
if [ -n "$CONTEXT" ]; then
  inject_pvp_trailers "$COMMIT_MSG_FILE" "$CONTEXT"
fi
```

### post-commit

**Timing**: After commit is created
**Purpose**: Attach rich metadata as git notes

```bash
#!/bin/sh
COMMIT_SHA=$(git rev-parse HEAD)

# Create decision log note
git notes --ref=pvp add -f -m "$DECISION_JSON" "$COMMIT_SHA"

# Notify bridge service
notify_pvp_commit "$COMMIT_SHA"
```

### pre-push

**Timing**: Before commits are pushed
**Purpose**: Validate PVP metadata coverage

```bash
#!/bin/sh
# Calculate PVP coverage
COVERAGE=$(calculate_pvp_coverage "$COMMITS")

if [ "$PVP_ENFORCE_METADATA" = "strict" ] && [ "$COVERAGE" -lt "$MIN_COVERAGE" ]; then
  echo "ERROR: PVP metadata coverage below threshold"
  exit 1
fi
```

---

## Commit Message Format

### Header (72 chars max)

```
<type>(<scope>): <description> [pvp:<ref>]
```

**Types**: `feat`, `fix`, `refactor`, `explore`, `revert`, `docs`, `test`, `chore`, `style`

### Body

```
<rationale>

Alternatives considered:
- Option A: reason rejected
- Option B: reason rejected

Confidence: high (0.90)
```

### Trailers

```
PVP-Session: <session-id>
PVP-Messages: <msg-id>,<msg-id>
PVP-Confidence: 0.00-1.00
PVP-Decision-Type: implementation|exploration|correction|reversion|merge-resolution
Decision-By: human:<name>,ai:<name>
Approved-By: human:<name>
```

---

## Synchronization

### Push (share PVP metadata)

```bash
# Code + PVP metadata
git push origin main
git push origin 'refs/notes/pvp/*'
git push origin 'refs/pvp/*'
```

### Fetch (receive PVP metadata)

```bash
git fetch origin 'refs/notes/pvp/*:refs/notes/pvp/*'
git fetch origin 'refs/pvp/*:refs/pvp/*'
```

### Recommended Aliases

```ini
[alias]
  pvp-push = "!git push origin HEAD && git push origin 'refs/notes/pvp/*' && git push origin 'refs/pvp/*'"
  pvp-fetch = "!git fetch origin && git fetch origin 'refs/notes/pvp/*:refs/notes/pvp/*' && git fetch origin 'refs/pvp/*:refs/pvp/*'"
```

---

## Query Capabilities

### By Session

```bash
git log --all --grep="PVP-Session: ses_abc123"
```

### By Participant

```bash
git log --all --grep="Decision-By:.*human:alice"
```

### By Confidence

```bash
# Low confidence commits (exploratory)
git log --all --format='%(trailers:key=PVP-Confidence,valueonly)' | awk '$1 < 0.5'
```

### Decision Timeline

```bash
git pvp-log  # Custom alias showing decision context
```

### Tool Execution History

```bash
git notes --ref=pvp/tools show HEAD | jq '.executions[]'
```

---

## Confidence Model

### Scale

| Level | Range | Meaning |
|-------|-------|---------|
| **Very High** | 0.80-1.00 | Team consensus, tested, production-ready |
| **High** | 0.60-0.79 | Well-understood, minor uncertainty |
| **Medium** | 0.40-0.59 | Reasonable approach, may need iteration |
| **Low** | 0.20-0.39 | Experimental, needs validation |
| **Very Low** | 0.00-0.19 | Highly speculative, expect changes |

### Assessment Factors

```typescript
interface ConfidenceFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number;
  explanation?: string;
}

// Example factors
const factors: ConfidenceFactor[] = [
  { factor: 'team_consensus', impact: 'positive', weight: 0.2 },
  { factor: 'tested_approach', impact: 'positive', weight: 0.2 },
  { factor: 'known_risks', impact: 'negative', weight: -0.15 },
  { factor: 'reversible', impact: 'positive', weight: 0.1 },
  { factor: 'has_tests', impact: 'positive', weight: 0.1 },
];
```

---

## Installation

### Quick Start

```bash
# Install git hooks
cd /path/to/pvp
./src/git-hooks/install.sh

# Configure
cp src/git-hooks/pvp-git.config.example.json ~/.pvp-git.config.json

# Start bridge service (integrated with PVP server)
# The bridge starts automatically when PVP server runs
```

### Manual Hook Installation

```bash
# Copy hooks to git directory
cp src/git-hooks/hooks/* .git/hooks/
chmod +x .git/hooks/*
```

### Verify Installation

```bash
# Check hook installation
ls -la .git/hooks/prepare-commit-msg

# Test bridge connectivity
curl http://localhost:9847/health
```

---

## Integration Checklist

- [ ] Install git hooks via `install.sh`
- [ ] Configure `~/.pvp-git.config.json`
- [ ] Enable bridge service in PVP server config
- [ ] Set up git push/fetch aliases for PVP refs
- [ ] Configure remote to accept PVP refs (if using GitHub/GitLab)
- [ ] Train team on commit message format
- [ ] Set up CI validation for PVP metadata (optional)

---

## Future Enhancements

### Planned Features

1. **Decision Tree Visualization**: Interactive TUI/GUI for exploring decision history
2. **Confidence Analytics**: Dashboard showing confidence trends over time
3. **Session Replay**: Time-travel debugging through vibecoding sessions
4. **Cross-Repository Linking**: Track decisions across multiple repositories
5. **AI Learning**: Use historical decisions to improve future suggestions

### Integration Opportunities

- **GitHub/GitLab**: Display PVP metadata in PR/MR views
- **VS Code**: Extension showing decision context alongside code
- **Lazygit**: Custom panel for PVP metadata
- **CI/CD**: Automated confidence-based deployment gates

---

## References

- [Git Objects Documentation](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects)
- [Git Interpret-Trailers](https://git-scm.com/docs/git-interpret-trailers)
- [Git Notes](https://git-scm.com/docs/git-notes)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [PVP Protocol Specification](./PVP_IMPLEMENTATION_GUIDE.md)
- [Git Commit Protocol](./GIT_COMMIT_PROTOCOL.md)
