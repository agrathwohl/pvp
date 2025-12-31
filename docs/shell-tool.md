# PVP Shell Tool

## Overview

The Shell Tool is a comprehensive command execution system for PVP that enables safe, collaborative shell command execution with real-time output streaming and human-in-the-loop approval workflows.

## Features

### 🛡️ Multi-Layer Safety System

1. **Pattern-Based Risk Categorization**
   - 60+ command patterns covering common shell operations
   - Automatic risk assessment: safe → low → medium → high → critical
   - Blocks catastrophic commands entirely (rm -rf /, dd to devices, fork bombs)

2. **Bun Runtime Safety**
   - Automatic shell injection prevention via Bun.spawn
   - Timeout enforcement (configurable per category)
   - Memory buffer limits to prevent resource exhaustion
   - PTY support for interactive applications

3. **Approval Workflows**
   - Safe commands: Auto-approved, execute immediately
   - Write/Destructive: Human approval required via gates
   - Blocked commands: Rejected before proposal

### 📊 Command Categories

| Category | Risk | Auto-Approve | Examples |
|----------|------|--------------|----------|
| **Read** | Safe | ✅ Yes | ls, cat, grep, git status, ps |
| **Write** | Low-Medium | ❌ No | mkdir, npm install, git commit, chmod |
| **Destructive** | High | ❌ No | rm -rf, killall, git reset --hard, docker rm |
| **Blocked** | Critical | 🚫 Never | rm -rf /, dd to devices, mkfs, shutdown |

### 🔄 Streaming Output

- Real-time stdout/stderr streaming via `tool.output` messages
- Separate streams for stdout (cyan) and stderr (red) in TUI
- All participants see output simultaneously
- Streaming continues until command completion

### 🎯 PVP Protocol Integration

#### Message Flow

```
1. Agent proposes command
   ↓ tool.propose

2a. If safe: Auto-execute
    ↓ tool.execute

2b. If risky: Create gate
    ↓ gate.request
    → Human approves/rejects
    ↓ gate.approve
    ↓ tool.execute

3. Execute with streaming
   ↓ tool.output (multiple, streaming)

4. Send final result
   ↓ tool.result
```

#### Message Types

**tool.propose**
```typescript
{
  tool_name: "shell",
  arguments: {
    command: "ls",
    args: ["-la"],
    full_command: "ls -la"
  },
  agent: ParticipantId,
  risk_level: "safe" | "low" | "medium" | "high" | "critical",
  description: "Execute shell command: ls -la",
  requires_approval: boolean,
  category: "shell_execute"
}
```

**tool.output** (streaming)
```typescript
{
  tool_proposal: MessageId,
  stream: "stdout" | "stderr",
  text: string,
  complete: boolean
}
```

**tool.result** (final)
```typescript
{
  tool_proposal: MessageId,
  success: boolean,
  result: {
    exitCode: number,
    stdout: string,
    stderr: string
  },
  error?: string,
  duration_ms: number
}
```

## Architecture

### Components

1. **shell-executor.ts** - Core execution engine
   - Bun.spawn integration
   - Pattern-based categorization
   - Safety enforcement
   - Streaming output handling

2. **shell-tool.ts** - PVP protocol layer
   - Protocol message creation
   - Proposal management
   - Result broadcasting

3. **claude-agent.ts** - Agent integration
   - Tool handler initialization
   - Proposal storage
   - Execution coordination

4. **TUI (store.ts + app.tsx)** - User interface
   - Tool proposal display
   - Streaming output visualization
   - Gate approval prompts
   - Execution results

### Safety Implementation

```typescript
// Pattern matching for categorization
const COMMAND_PATTERNS: CommandPattern[] = [
  // Blocked commands (never execute)
  { pattern: /^rm\s+.*-rf\s+\/$/, category: "blocked",
    riskLevel: "critical", blocked: true },

  // Destructive commands (require approval)
  { pattern: /^rm\s+.*-r/, category: "destructive",
    riskLevel: "high" },

  // Write commands (require approval)
  { pattern: /^npm\s+install/, category: "write",
    riskLevel: "medium" },

  // Read commands (auto-approved)
  { pattern: /^ls/, category: "read",
    riskLevel: "safe" },
];

// Safety enforcement
export function executeShellCommand(
  shellCmd: ShellCommand,
  config: ShellExecutionConfig,
  callbacks: StreamingOutput
): Promise<ExecutionResult> {
  // Block check
  const blockCheck = isCommandBlocked(shellCmd);
  if (blockCheck.blocked) {
    throw new Error(`Blocked: ${blockCheck.reason}`);
  }

  // Spawn with safety controls
  const proc = spawn([shellCmd.command, ...shellCmd.args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  // Timeout enforcement
  setTimeout(() => proc.kill(), config.timeout);

  // Buffer limit enforcement
  if (stdoutData.length > config.maxBuffer) {
    proc.kill();
    throw new Error(`Output exceeded ${config.maxBuffer} bytes`);
  }

  // Stream to callbacks
  callbacks.onStdout?.(chunk);
  callbacks.onStderr?.(chunk);
}
```

## Usage Examples

### From Claude Agent

```typescript
const agent = new ClaudeAgent({
  serverUrl: "ws://localhost:3000",
  agentName: "Shell Assistant"
});

await agent.connect();

// Propose safe command (auto-approved)
await agent.proposeShellCommand("ls -la");

// Propose risky command (requires approval)
await agent.proposeShellCommand("npm install lodash");

// Blocked command (throws error)
try {
  await agent.proposeShellCommand("rm -rf /");
} catch (error) {
  console.log("Command blocked:", error.message);
}
```

### From PVP Server/Router

The server automatically handles:
- Gate creation for risky commands
- Broadcasting tool.propose to all participants
- Routing gate.approve → tool.execute
- Broadcasting tool.output/result to all participants

## Testing

Run the test suite:

```bash
bun test src/agent/tools/shell-executor.test.ts
```

Run the demo:

```bash
# Terminal 1: Start server
bun run src/server/index.ts

# Terminal 2: Start TUI
bun run src/tui/index.ts --create

# Terminal 3: Run demo
bun run examples/shell-tool-demo.ts
```

## Configuration

### Default Timeouts

- Read commands: 30 seconds
- Write commands: 60 seconds
- Destructive commands: 120 seconds

### Default Buffer Limits

- Read commands: 10 MB
- Write commands: 5 MB
- Destructive commands: 1 MB

### Customization

Modify `COMMAND_PATTERNS` in `shell-executor.ts` to:
- Add new command patterns
- Adjust risk levels
- Block additional commands
- Customize categorization

## Security Considerations

1. **Shell Injection Prevention**: Bun.spawn uses array args, preventing injection
2. **Resource Limits**: Timeouts and buffer limits prevent DoS
3. **Approval Workflows**: Risky operations require human approval
4. **Catastrophic Blocking**: Most dangerous commands blocked entirely
5. **Audit Trail**: All commands logged in PVP message stream

## Future Enhancements

- [ ] Command whitelisting per session
- [ ] Per-participant permission levels
- [ ] Command history and recall
- [ ] Interactive command support (PTY)
- [ ] Environment variable management
- [ ] Working directory control
- [ ] Command composition and pipelines
- [ ] Custom approval quorum rules
- [ ] Execution sandboxing (containers/VMs)

## Related Documentation

- [PVP Protocol Specification](../protocol/README.md)
- [Gate System](./gates.md)
- [Tool System](./tools.md)
- [Bun Runtime Documentation](https://bun.sh/docs/runtime/spawn)
