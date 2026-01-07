# PVP Git Hooks

Automatic decision context capture from vibecoding sessions, embedded directly into git commits.

## Overview

This module provides git hooks that integrate with PVP (Pair Vibecoding Protocol) sessions to:

1. **Capture decision context** - Extract relevant messages, tool executions, and approvals from active PVP sessions
2. **Embed metadata in commits** - Add structured PVP metadata to commit messages
3. **Store extended data in git-notes** - Preserve full session context for audit/review
4. **Validate decision trails** - Ensure commits have proper provenance before pushing

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   PVP Server        │────▶│  Git Bridge Service │
│   (session.ts)      │     │  (bridge-service.ts)│
└─────────────────────┘     └──────────┬──────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
     ┌────────────────┐      ┌────────────────┐       ┌────────────────┐
     │ prepare-commit │      │  post-commit   │       │   pre-push     │
     │     -msg       │      │                │       │                │
     └────────────────┘      └────────────────┘       └────────────────┘
              │                        │                        │
              ▼                        ▼                        ▼
       Embeds metadata         Stores git-notes         Validates trail
       in commit msg           Extended data            Checks coverage
```

## Components

### Git Hooks (POSIX sh)

#### `prepare-commit-msg`
- Queries PVP bridge for current session state
- Extracts messages since last commit
- Generates commit message metadata block
- Suggests commit message based on session activity

#### `post-commit`
- Stores extended metadata in git-notes (`refs/notes/pvp`)
- Updates PVP session with commit reference
- Triggers configured webhooks

#### `pre-push`
- Validates commits have PVP metadata
- Reports coverage percentage
- Can block pushes if below threshold (configurable)

### Bridge Service (TypeScript)

Local daemon that maintains session state and provides API for hooks:

- **Unix Socket**: `/tmp/pvp-git-bridge.sock` (primary)
- **HTTP API**: `http://localhost:9847` (fallback)

## Installation

### Quick Install (Current Repo)

```bash
./install.sh -r .
```

### Global Install (All New Repos)

```bash
./install.sh -g
```

### Manual Installation

1. Copy hooks to your repo's `.git/hooks/`:
```bash
cp hooks/* /path/to/repo/.git/hooks/
chmod +x /path/to/repo/.git/hooks/*
```

2. Start the bridge service:
```bash
pvp-git-bridge start
```

## Configuration

Create `.pvp-git.config.json` in your repository root:

```json
{
  "enforcement": {
    "enforce_metadata": false,
    "min_pvp_coverage": 0,
    "warn_only": true
  },
  "message_filter": {
    "include_types": ["prompt.submit", "tool.propose", "gate.approve"],
    "max_messages": 50
  },
  "webhooks": [
    {
      "url": "https://your-ci.example.com/pvp-webhook",
      "events": ["commit", "push"]
    }
  ]
}
```

See `pvp-git.config.schema.json` for full schema.

## Usage

### Normal Workflow

1. Start a PVP session
2. Work with AI agents (prompts, tool approvals, etc.)
3. Make commits as usual - metadata is automatically added

### Commit Message Format

```
Your commit message here

---
PVP-META: true
PVP-SESSION: 01HQXYZ...
PVP-PARTICIPANTS: alice(human), claude(agent)
PVP-MESSAGES: 15
PVP-PROMPTS: 3
PVP-APPROVALS: 2
PVP-TOOLS: shell_execute:5, file_write:3
```

### Viewing Extended Metadata

```bash
# Show PVP notes for a commit
git notes --ref=refs/notes/pvp show HEAD

# Show notes for all commits
git log --show-notes=refs/notes/pvp
```

### Bridge Service Commands

```bash
pvp-git-bridge start    # Start the bridge daemon
pvp-git-bridge stop     # Stop the bridge
pvp-git-bridge status   # Show status and session info
pvp-git-bridge logs     # Tail the log file
```

## Integration with PVP Server

The bridge service can be integrated directly with the PVP server:

```typescript
import { PvpGitBridgeService } from './git-hooks/bridge';

const bridge = new PvpGitBridgeService({
  socket_path: '/tmp/pvp-git-bridge.sock',
  http_port: 9847
});

// In your PVP server router:
router.on('message', (message) => {
  bridge.onMessage(message);
});

router.on('session.create', (session) => {
  bridge.onSessionStart(session.id, session.participants);
});

router.on('session.end', (session) => {
  bridge.onSessionEnd(session.id);
});

await bridge.start();
```

## API Reference

### Bridge HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/commit-context` | GET | Get current commit context |
| `/extended-metadata` | GET | Get full session metadata |
| `/status` | GET | Get bridge status |
| `/commit-created` | POST | Notify of new commit |
| `/session-started` | POST | Notify of new session |
| `/session-ended` | POST | Notify of session end |
| `/message` | POST | Send message to bridge |
| `/reset` | POST | Reset current context |

### Socket Protocol

JSON messages over Unix socket (newline-delimited):

```json
{"action": "get_commit_context"}
```

Response:
```json
{
  "success": true,
  "data": {
    "session_id": "01HQXYZ...",
    "messages_since_last_commit": 15,
    "active_participants": "alice(human), claude(agent)",
    "decision_summary": "PVP session: 3 prompt(s); tools: shell_execute, file_write"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PVP_GIT_SOCKET` | `/tmp/pvp-git-bridge.sock` | Unix socket path |
| `PVP_GIT_PORT` | `9847` | HTTP fallback port |
| `PVP_STATE_FILE` | `~/.pvp/current-session.json` | State file path |
| `PVP_NOTES_REF` | `refs/notes/pvp` | Git notes reference |
| `PVP_ENFORCE_METADATA` | `false` | Require metadata on commits |
| `PVP_WARN_ONLY` | `true` | Warn vs reject on violations |

## Troubleshooting

### Hooks not executing
- Check hooks are executable: `ls -la .git/hooks/`
- Verify bridge is running: `pvp-git-bridge status`

### No metadata in commits
- Ensure PVP session is active
- Check bridge logs: `pvp-git-bridge logs`

### Push validation fails
- Set `PVP_ENFORCE_METADATA=false` to bypass
- Or add metadata retroactively with `git commit --amend`

## Uninstallation

```bash
./uninstall.sh -r .        # Remove from specific repo
./uninstall.sh -g          # Remove global hooks
./uninstall.sh -a          # Remove everything
```
