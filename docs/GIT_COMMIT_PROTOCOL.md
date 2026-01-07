# PVP Git Commit Protocol Specification

**Version**: 1.0.0
**Status**: Draft
**Last Updated**: 2026-01-06

## Overview

This specification defines a git commit message format that embeds rich PVP decision context while maintaining compatibility with standard git tooling. The format supports human readability in `git log` and GitHub interfaces while enabling machine parsing for automated tooling.

---

## Design Principles

1. **Human-First**: Readable in standard `git log --oneline` without special tooling
2. **Machine-Parseable**: Structured trailers enable programmatic access to metadata
3. **Conventional Commits Compatible**: Extends rather than replaces the standard
4. **Compact**: Suitable for frequent vibecoding commits without ceremony overhead
5. **Progressive Disclosure**: Essential info in header, details in body/trailers

---

## Message Structure

A PVP-enhanced commit message consists of three sections:

```
<header>

[body]

[trailers]
```

---

## Section 1: Header Format

The header is the first line of the commit message, limited to **72 characters**.

### Syntax

```
<type>(<scope>): <description> [pvp:<ref>]
```

### Components

| Component | Required | Description |
|-----------|----------|-------------|
| `type` | Yes | Change category (see Type Prefixes) |
| `scope` | No | Affected module or component |
| `description` | Yes | Imperative mood summary |
| `pvp:<ref>` | No | Reference to PVP message or session |

### Type Prefixes

| Type | Description | Use Case |
|------|-------------|----------|
| `feat` | New feature or capability | Adding new functionality |
| `fix` | Bug fix | Correcting defective behavior |
| `refactor` | Code restructuring | No functional change |
| `explore` | Experimental or low-confidence change | Testing hypotheses |
| `revert` | Reverting previous changes | Undoing commits |
| `docs` | Documentation only | README, comments, specs |
| `test` | Adding or modifying tests | Test coverage |
| `chore` | Maintenance tasks | Dependencies, configs |
| `style` | Code style changes | Formatting, linting |

### Header Examples

```
feat(auth): implement JWT validation [pvp:msg-01HX7K9P]
fix(session): resolve race condition in gate timeout
refactor: extract message router from session manager
explore(transport): test WebRTC as alternative to WebSocket [pvp:fork-abc]
revert: undo session.config_update payload changes
```

### Character Budget

```
type(scope): description [pvp:ref]
^^^^^       ^                    ^
 5-8        ~40-50 chars         ~15 chars (optional)
```

Reserve 15-20 characters for the PVP reference if needed.

---

## Section 2: Body Format

The body provides expanded context about the change. It is optional but recommended for non-trivial changes.

### Structure

```
[blank line after header]

<rationale>

[Alternatives considered]:
- <alternative 1>: <why rejected>
- <alternative 2>: <why rejected>

[Confidence]: <low|medium|high> (<percentage>)

[Discussion context]:
<relevant excerpt or summary from PVP session>
```

### Formatting Rules

1. Wrap text at **72 characters**
2. Separate paragraphs with blank lines
3. Use bullet points for lists
4. Section headers in brackets are optional labels

### Body Example

```
Implement JWT validation middleware for the WebSocket transport.

The authentication flow validates tokens on connection upgrade,
rejecting invalid or expired tokens before session.join processing.
This reduces load on the session manager and provides early feedback.

Alternatives considered:
- Validate in session manager: rejected due to late error feedback
- External auth service: adds deployment complexity for MVP

Confidence: high (0.90)

Discussed during session-01HX7K9P where team agreed JWT is
sufficient for initial release. OAuth2 deferred to v2.
```

---

## Section 3: Trailer Format

Trailers are key-value pairs at the end of the commit message, following the git trailer convention.

### Syntax

```
<Key>: <value>
```

Trailers must be separated from the body by a blank line. Multiple values use comma separation.

### PVP-Specific Trailers

| Trailer | Required | Format | Description |
|---------|----------|--------|-------------|
| `PVP-Session` | No | `<session-id>` | Source PVP session |
| `PVP-Messages` | No | `<msg-id>[,<msg-id>...]` | Related message IDs |
| `PVP-Fork` | No | `<fork-id>` | Associated fork |
| `PVP-Confidence` | No | `0.00-1.00` | Decision confidence level |
| `PVP-Decision-Type` | No | See Decision Types | Nature of the decision |
| `Decision-By` | Yes* | `<type>:<name>[,...]` | Who made the decision |
| `Reviewed-By` | No | `<type>:<name>[,...]` | Who reviewed the change |
| `Approved-By` | No | `<type>:<name>[,...]` | Gate approvers |

*Required for changes with PVP context

### Decision Types

| Type | Description |
|------|-------------|
| `implementation` | Code implementation choice |
| `architecture` | System design decision |
| `exploration` | Experimental hypothesis |
| `correction` | Bug fix or error correction |
| `reversion` | Undoing a previous decision |
| `merge-resolution` | Conflict resolution |

### Participant Format

Participants use the format `<type>:<identifier>`:

```
human:alice
human:bob
ai:claude
ai:gpt4
agent:code-reviewer
```

### Trailer Examples

```
PVP-Session: 01HX7K9P4QZCVD3N8MYW6R5T2B
PVP-Messages: msg-01,msg-05,msg-12
PVP-Fork: fork-experimental-auth
PVP-Confidence: 0.85
PVP-Decision-Type: implementation
Decision-By: human:alice,ai:claude
Reviewed-By: human:bob
Approved-By: human:alice,human:bob
```

---

## Section 4: Extended Metadata via Git Notes

For detailed context that exceeds commit message size limits, use git notes.

### Namespace Convention

```
refs/notes/pvp
```

### Creating PVP Notes

```bash
git notes --ref=pvp add -m '<json-content>' <commit>
```

### Note Structure

```json
{
  "version": 1,
  "session": {
    "id": "01HX7K9P4QZCVD3N8MYW6R5T2B",
    "name": "Auth Implementation Sprint"
  },
  "conversation": {
    "thread_id": "thread-abc",
    "messages": [
      {
        "id": "msg-01",
        "type": "prompt.submit",
        "sender": "human:alice",
        "content": "Implement JWT validation",
        "timestamp": "2026-01-06T10:00:00Z"
      },
      {
        "id": "msg-05",
        "type": "response.end",
        "sender": "ai:claude",
        "content": "Here is the implementation...",
        "timestamp": "2026-01-06T10:02:30Z"
      }
    ]
  },
  "tools": {
    "executions": [
      {
        "id": "tool-01",
        "name": "write_file",
        "path": "src/auth/jwt.ts",
        "approved_by": ["human:alice"],
        "duration_ms": 150
      }
    ]
  },
  "alternatives": [
    {
      "branch": "explore/oauth2",
      "reason_abandoned": "Too complex for MVP timeline",
      "commits": ["abc123", "def456"]
    }
  ],
  "metrics": {
    "thinking_tokens": 2500,
    "output_tokens": 1200,
    "latency_ms": 3500
  }
}
```

### Reading PVP Notes

```bash
git notes --ref=pvp show <commit>
```

---

## Complete Examples

### Example 1: Simple Feature Implementation

**Scenario**: Adding a new feature with high confidence after team discussion.

```
feat(auth): implement JWT validation middleware [pvp:msg-01HX7K9P]

Add JWT validation to WebSocket upgrade handler. Tokens are validated
before session.join processing, rejecting invalid connections early.

The middleware extracts the token from the Authorization header,
validates signature and expiration, and attaches the decoded payload
to the connection context for downstream use.

Alternatives considered:
- Session-level validation: rejected for late error feedback
- Cookie-based tokens: rejected for WebSocket compatibility issues

Confidence: high (0.90)

PVP-Session: 01HX7K9P4QZCVD3N8MYW6R5T2B
PVP-Messages: msg-01,msg-05,msg-12
PVP-Confidence: 0.90
PVP-Decision-Type: implementation
Decision-By: human:alice,ai:claude
Reviewed-By: human:bob
```

---

### Example 2: Bugfix with Debugging Conversation

**Scenario**: Fixing a race condition identified through collaborative debugging.

```
fix(gates): resolve race condition in quorum evaluation [pvp:msg-42]

The gate timeout timer could fire while an approval was being
processed, leading to incorrect rejection of valid approvals.

Root cause: Non-atomic check-then-act pattern in evaluateQuorum().
The timeout callback checked approval count, then the approval
handler updated it, then the timeout callback rejected the gate.

Solution: Use a mutex to serialize gate state transitions. All
operations (approve, reject, timeout) now acquire the lock before
reading or modifying gate state.

Debug trace captured in PVP session showed interleaved operations:
  T+0ms: timeout callback reads approvals=0
  T+1ms: approval handler sets approvals=1
  T+2ms: timeout callback rejects gate (stale read)

Confidence: high (0.95)

PVP-Session: 01HX8A2M5RKVF7N9QYZ3W6P4C
PVP-Messages: msg-38,msg-39,msg-40,msg-41,msg-42
PVP-Confidence: 0.95
PVP-Decision-Type: correction
Decision-By: human:bob,ai:claude
Reviewed-By: human:alice
Approved-By: human:alice,human:bob
```

---

### Example 3: Exploratory Change with Low Confidence

**Scenario**: Testing a hypothesis about performance optimization.

```
explore(transport): test binary serialization for messages [pvp:fork-perf]

Hypothesis: Binary message serialization (MessagePack) will reduce
bandwidth and parsing overhead compared to JSON.

This is an experimental branch to measure:
- Message size reduction
- Serialization/deserialization latency
- Impact on debugging (binary is less readable)

Expected outcome: 30-50% size reduction, 10-20% latency improvement.
If results are positive, will propose as default for production.

WARNING: This is exploratory code. Do not merge without performance
validation and team review.

Confidence: low (0.45)

PVP-Session: 01HX9B3N6SLWG8O0RZA4X7Q5D
PVP-Fork: fork-perf-binary
PVP-Confidence: 0.45
PVP-Decision-Type: exploration
Decision-By: human:alice,ai:claude
```

---

### Example 4: Revert with Explanation

**Scenario**: Rolling back a change that caused production issues.

```
revert: undo async gate timeout handling [pvp:msg-89]

This reverts commit a1b2c3d4e5f6g7h8i9j0.

The async timeout handling introduced in the previous commit caused
a memory leak in long-running sessions. Each gate created a timer
that was not properly cleaned up on gate resolution.

Immediate action: Revert to synchronous handling.
Follow-up: Investigate proper async cleanup patterns.

Incident timeline:
  14:00 - Deploy with async timeouts
  15:30 - Memory usage alerts fire
  16:00 - Root cause identified via PVP debugging session
  16:15 - Decision to revert made by alice and bob

Confidence: high (0.95) for revert decision

PVP-Session: 01HXA4C7O8TMH1P2SAB5Y9R6E
PVP-Messages: msg-85,msg-86,msg-87,msg-88,msg-89
PVP-Confidence: 0.95
PVP-Decision-Type: reversion
Decision-By: human:alice,human:bob,ai:claude
Approved-By: human:alice,human:bob
```

---

### Example 5: Merge Commit with Conflict Resolution Context

**Scenario**: Merging a feature branch with conflicts requiring human judgment.

```
Merge branch 'feature/websocket-reconnect' into main

Integrate WebSocket reconnection with exponential backoff.

Conflict resolution decisions:

1. src/transports/websocket.ts (lines 45-60):
   - Conflict: main had heartbeat changes, branch had reconnect logic
   - Resolution: Kept reconnect logic, integrated heartbeat into
     reconnection state machine
   - Decision-By: human:alice,ai:claude

2. src/tui/hooks/useTransport.ts (lines 20-35):
   - Conflict: Different state management approaches
   - Resolution: Used branch approach (Zustand store) as it better
     handles reconnection state
   - Decision-By: human:bob,ai:claude

3. tests/transport.test.ts:
   - Conflict: Overlapping test names
   - Resolution: Renamed tests for clarity, merged both test suites
   - Decision-By: human:alice

All conflicts reviewed in PVP session with full team visibility.

Confidence: high (0.88)

PVP-Session: 01HXB5D8P9UNI2Q3TBC6Z0S7F
PVP-Messages: msg-102,msg-105,msg-108,msg-112
PVP-Fork: fork-websocket-reconnect
PVP-Confidence: 0.88
PVP-Decision-Type: merge-resolution
Decision-By: human:alice,human:bob,ai:claude
Reviewed-By: human:charlie
Approved-By: human:alice,human:bob
```

---

## Tooling Integration

### Parsing Commit Messages

```typescript
interface PVPCommitMetadata {
  type: string;
  scope?: string;
  description: string;
  pvpRef?: string;
  body?: string;
  confidence?: number;
  sessionId?: string;
  messageIds?: string[];
  forkId?: string;
  decisionType?: string;
  decisionBy?: Participant[];
  reviewedBy?: Participant[];
  approvedBy?: Participant[];
}

interface Participant {
  type: 'human' | 'ai' | 'agent';
  identifier: string;
}

function parsePVPCommit(commitMessage: string): PVPCommitMetadata {
  const lines = commitMessage.split('\n');
  const headerMatch = lines[0].match(
    /^(\w+)(?:\(([^)]+)\))?:\s+(.+?)(?:\s+\[pvp:([^\]]+)\])?$/
  );

  // ... parsing implementation
}
```

### Git Hooks

#### `prepare-commit-msg` Hook

Automatically populate PVP trailers from environment:

```bash
#!/bin/bash
# .git/hooks/prepare-commit-msg

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only modify if not amend, merge, or squash
if [ "$COMMIT_SOURCE" != "message" ]; then
  exit 0
fi

# Check for PVP session context
if [ -n "$PVP_SESSION_ID" ]; then
  echo "" >> "$COMMIT_MSG_FILE"
  echo "PVP-Session: $PVP_SESSION_ID" >> "$COMMIT_MSG_FILE"
fi

if [ -n "$PVP_MESSAGES" ]; then
  echo "PVP-Messages: $PVP_MESSAGES" >> "$COMMIT_MSG_FILE"
fi

if [ -n "$PVP_DECISION_BY" ]; then
  echo "Decision-By: $PVP_DECISION_BY" >> "$COMMIT_MSG_FILE"
fi
```

#### `commit-msg` Hook

Validate commit message format:

```bash
#!/bin/bash
# .git/hooks/commit-msg

COMMIT_MSG_FILE=$1
HEADER=$(head -1 "$COMMIT_MSG_FILE")

# Validate header format
if ! echo "$HEADER" | grep -qE '^(feat|fix|refactor|explore|revert|docs|test|chore|style)(\([^)]+\))?:\s.+'; then
  echo "ERROR: Invalid commit header format"
  echo "Expected: <type>(<scope>): <description>"
  echo "Got: $HEADER"
  exit 1
fi

# Validate header length
if [ ${#HEADER} -gt 72 ]; then
  echo "ERROR: Header exceeds 72 characters (${#HEADER})"
  exit 1
fi

# Validate PVP trailers if present
if grep -q "^PVP-Confidence:" "$COMMIT_MSG_FILE"; then
  CONFIDENCE=$(grep "^PVP-Confidence:" "$COMMIT_MSG_FILE" | cut -d: -f2 | tr -d ' ')
  if ! echo "$CONFIDENCE" | grep -qE '^0\.[0-9]+$|^1\.00$'; then
    echo "ERROR: PVP-Confidence must be 0.00-1.00"
    exit 1
  fi
fi
```

### Git Aliases

Add these to your `.gitconfig`:

```ini
[alias]
  # Show commits with PVP context
  pvp-log = log --format='%C(yellow)%h%C(reset) %s%n%C(dim)Session: %(trailers:key=PVP-Session,valueonly,separator=%x2C)%C(reset)%n%C(dim)Decision: %(trailers:key=Decision-By,valueonly,separator=%x2C)%C(reset)%n'

  # Show PVP notes for a commit
  pvp-notes = notes --ref=pvp show

  # Find commits by PVP session
  pvp-session = "!f() { git log --all --grep=\"PVP-Session: $1\"; }; f"

  # Find commits by participant
  pvp-by = "!f() { git log --all --grep=\"Decision-By:.*$1\"; }; f"
```

---

## Migration from Standard Commits

### Compatibility Mode

Existing commits without PVP metadata remain valid. The format is additive:

| Feature | Standard | PVP-Enhanced |
|---------|----------|--------------|
| Type prefix | Required | Required |
| Scope | Optional | Optional |
| Description | Required | Required |
| PVP reference | N/A | Optional |
| Body | Optional | Optional |
| PVP trailers | N/A | Optional |
| Git notes | N/A | Optional |

### Gradual Adoption

1. **Phase 1**: Add `Decision-By` trailer to all commits
2. **Phase 2**: Add PVP session references when available
3. **Phase 3**: Add confidence levels for non-trivial changes
4. **Phase 4**: Use git notes for full conversation context

---

## Appendix A: Quick Reference Card

```
HEADER (72 chars max):
  <type>(<scope>): <description> [pvp:<ref>]

TYPES:
  feat fix refactor explore revert docs test chore style

BODY (wrap at 72):
  Rationale paragraph(s)

  Alternatives considered:
  - Option A: reason rejected

  Confidence: high (0.90)

TRAILERS:
  PVP-Session: <session-id>
  PVP-Messages: <msg-id>,<msg-id>
  PVP-Fork: <fork-id>
  PVP-Confidence: 0.00-1.00
  PVP-Decision-Type: implementation|architecture|exploration|correction|reversion|merge-resolution
  Decision-By: human:<name>,ai:<name>
  Reviewed-By: human:<name>
  Approved-By: human:<name>
```

---

## Appendix B: Confidence Level Guidelines

| Level | Range | Criteria |
|-------|-------|----------|
| **High** | 0.80-1.00 | Team consensus, tested approach, production-ready |
| **Medium** | 0.50-0.79 | Reasonable approach, some uncertainty, may need iteration |
| **Low** | 0.00-0.49 | Experimental, hypothesis testing, expect changes |

Use the following questions to assess confidence:
- Has this approach been validated? (+0.2)
- Does the team agree? (+0.2)
- Are there known risks? (-0.1 to -0.3)
- Is this reversible if wrong? (+0.1)
- Do we have tests? (+0.1)

---

## Appendix C: Integration with PVP Protocol

This commit format integrates with the following PVP message types:

| Message Type | Commit Context |
|--------------|----------------|
| `prompt.submit` | Source of implementation request |
| `response.end` | AI-generated code or suggestions |
| `tool.execute` | File operations captured in commit |
| `gate.approve` | Approval recorded in `Approved-By` |
| `fork.create` | Maps to `PVP-Fork` trailer |
| `merge.execute` | Merge commit context |

The `PVP-Messages` trailer should reference the message chain from prompt to final tool execution for full traceability.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-06 | Initial specification |
