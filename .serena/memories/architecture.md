# PVP Architecture

## Message Protocol
Every message follows this structure:
```typescript
{
  v: 1,                    // Protocol version
  id: string,              // Message ID (ULID)
  ts: string,              // ISO timestamp
  session: string,         // Session ID
  sender: string,          // Participant ID
  type: string,            // Message type
  ref?: string,            // Reference to another message
  seq?: number,            // Sequence number (total ordering)
  causal_refs?: string[],  // Causal dependencies
  fork?: string,           // Fork ID
  payload: object          // Type-specific payload
}
```

## Message Types (40+)
- **Session**: create, join, leave, end, config_update
- **Participant**: announce, role_change
- **Context**: add, update, remove
- **Prompts**: draft, submit, amend
- **Thinking/Response**: start, chunk, end (streaming)
- **Tools**: propose, approve, reject, execute, result
- **Gates**: request, approve, reject, timeout
- **Forks/Merge**: create, switch, propose, execute

## Approval Gates (Human-in-the-Loop)
Gates require human approval before high-risk operations:
- Configurable per session: `require_approval_for: ["file_write", "shell_execute"]`
- Quorum rules: any, all, role, specific, majority
- Tool proposals flow: propose → gate check → approve/reject → execute

## Tool Flow (Agent)
1. Claude proposes tool use via `tool.propose`
2. Server checks if approval required
3. If gated: `gate.request` → wait for approvals → `gate.approve`
4. `tool.execute` sent to agent
5. Agent executes with shell-executor
6. `tool.result` sent back to continue conversation

## Key Classes
- `ClaudeAgent`: Main agent orchestrating Claude API calls and tool handling
- `ShellToolHandler`: Bun.spawn-based command execution with risk categorization
- `SessionManager`: Server-side session state management
- `GateManager`: Approval quorum evaluation
