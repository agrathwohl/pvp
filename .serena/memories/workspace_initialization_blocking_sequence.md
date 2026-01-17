# Agent Workspace Initialization - Blocking Sequence

## Requirement
Every agent connection MUST complete workspace initialization BEFORE:
- Any prompt can be replied to
- Any tool can be executed

## Implementation (claude-agent.ts)

### New Property (line 44)
```typescript
private workspaceInitialized: boolean = false;
```

### New Method: initializeWorkspace() (lines 128-176)
Called in connect() BEFORE WebSocket connects. Sequence:
1. Determine workDir: `localWorkDir || /tmp/pvp-agent/{sessionId|participantId}`
2. `mkdir -p workDir` (fs.mkdir with recursive: true)
3. Check `.git` exists (fs.access), if not: `Bun.spawn(["git", "init"])`
4. Set `workspaceInitialized = true`

### Modified connect() (lines 211-217)
```typescript
async connect(): Promise<void> {
  await this.initializeWorkspace();  // BLOCKING - must complete first
  this.client.connect();
}
```

### Defense-in-Depth Guard in handleMessage() (lines 262-268)
Blocks `prompt.submit` and `tool.execute` if `workspaceInitialized === false`

## Flow Guarantee
```
startAgent() → new ClaudeAgent() → connect() 
  → initializeWorkspace() [BLOCKING]
    → mkdir -p
    → git init (if needed)
    → workspaceInitialized = true
  → client.connect() [only now]
  → WebSocket messages can flow
```

No prompt or tool execution possible until workspace ready.
