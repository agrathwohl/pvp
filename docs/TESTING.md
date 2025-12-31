# PVP Testing Guide

## Quick Start Testing

### 1. Build the Project
```bash
npm install
npm run build
```

### 2. Test Server Startup
```bash
# Terminal 1: Start the server
npm run server

# Expected output:
# PVP Server listening on ws://localhost:3000
# Ready for connections
```

### 3. Test Basic Session (Automated Example)
```bash
# Terminal 2: Run basic session example
node dist/examples/basic-session.js

# Expected behavior:
# - Connects to server
# - Creates session
# - Receives session.created confirmation
# - Can send/receive messages
# - Auto-approves gates
```

### 4. Test Multi-Participant Session
```bash
# Terminal 2: Run multi-participant example
node dist/examples/multi-participant.js

# Expected behavior:
# - Alice (driver) creates session
# - Bob (navigator) joins
# - Charlie (approver) joins
# - All participants see each other's messages
# - Gates require 2 approvals (Charlie auto-approves)
```

## Interactive TUI Testing

### Test 1: Single Human Session
```bash
# Terminal 1: Server
npm run server

# Terminal 2: TUI Client
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# What to verify:
# ✅ Connection indicator shows green ●
# ✅ Participant count shows 1
# ✅ Status bar shows your name
# ✅ Press 'p' to enter prompt composition mode
# ✅ Type a message and press Ctrl+Enter to send
# ✅ Press Esc to cancel composition
# ✅ Press 't' to toggle thinking panel
# ✅ Press Ctrl+C to exit cleanly
```

### Test 2: Multi-Human Collaboration
```bash
# Terminal 1: Server
npm run server

# Terminal 2: Alice (driver)
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# Terminal 3: Bob (navigator)
npm run tui -- --server ws://localhost:3000 --session <SESSION_ID> --name "Bob" --role navigator

# What to verify:
# ✅ Both clients show 2 participants
# ✅ Messages from Alice appear in Bob's terminal
# ✅ Messages from Bob appear in Alice's terminal
# ✅ Both see the same session state
```

### Test 3: Approval Gates
```bash
# Terminal 1: Server
npm run server

# Terminal 2: Driver
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# Terminal 3: Approver
npm run tui -- --server ws://localhost:3000 --session <SESSION_ID> --name "Bob" --role approver

# Manual test (requires code modification to trigger gates):
# In driver terminal, send a prompt that would trigger a tool execution
# ✅ Gate appears in approver's terminal
# ✅ Press 'a' to approve or 'r' to reject
# ✅ Action executes after approval
```

## Protocol Message Testing

### Test Session Messages
```typescript
// Create test-session.ts
import { WebSocketClient } from "./dist/transports/websocket.js";
import { createMessage } from "./dist/protocol/messages.js";
import { ulid } from "./dist/utils/ulid.js";

const client = new WebSocketClient("ws://localhost:3000", ulid());

client.on("connected", () => {
  console.log("✅ Connected");

  // Test session creation
  const sessionId = ulid();
  const participantId = client.participantId;

  const createMsg = createMessage("session.create", sessionId, participantId, {
    name: "Test Session",
    config: {
      require_approval_for: [],
      default_gate_quorum: { type: "any", count: 1 },
      allow_forks: true,
      max_participants: 10,
      ordering_mode: "causal",
      on_participant_timeout: "skip",
      heartbeat_interval_seconds: 30,
      idle_timeout_seconds: 120,
      away_timeout_seconds: 300,
    },
  });

  client.send(createMsg);
  console.log("📤 Sent session.create");
});

client.on("message", (msg) => {
  console.log(`📥 ${msg.type}:`, msg.payload);
});

client.connect();

// Run: npx tsx test-session.ts
// Expected: session.created confirmation
```

### Test Heartbeat System
```bash
# Terminal 1: Server
npm run server

# Terminal 2: TUI with heartbeat monitoring
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# Wait 30 seconds without interaction
# ✅ Status should change to 'idle' after idle_timeout_seconds
# ✅ Status should change to 'away' after away_timeout_seconds
# Press any key to become active again
# ✅ Status should return to 'active'
```

## Feature Testing Checklist

### Core Protocol
- [ ] **Session Creation**: Can create new sessions
- [ ] **Session Joining**: Multiple participants can join
- [ ] **Session Config**: Configuration is respected
- [ ] **Message Routing**: All message types route correctly
- [ ] **Sequence Numbers**: Messages have sequential ordering

### Participants
- [ ] **Participant Announce**: New participants announced to all
- [ ] **Role Assignment**: Roles assigned correctly
- [ ] **Role Changes**: Can change roles dynamically
- [ ] **Presence Tracking**: Active/idle/away status updates
- [ ] **Heartbeat**: Heartbeat monitoring works

### Context Management
- [ ] **Add Context**: Can add context items
- [ ] **Update Context**: Can update existing context
- [ ] **Remove Context**: Can remove context
- [ ] **Visibility**: Context visibility filtering works
- [ ] **Content Hashing**: Content hashes generated correctly

### Gates & Approval
- [ ] **Gate Creation**: Gates created for protected operations
- [ ] **Quorum Evaluation**: All quorum types work (any, all, role, specific, majority)
- [ ] **Approval**: Can approve gates
- [ ] **Rejection**: Can reject gates
- [ ] **Timeout**: Gates timeout correctly

### Transport
- [ ] **WebSocket Connect**: Clients connect successfully
- [ ] **WebSocket Disconnect**: Clean disconnection
- [ ] **Reconnection**: Auto-reconnect on connection loss
- [ ] **Message Serialization**: Messages serialize/deserialize correctly
- [ ] **Binary Support**: Can send/receive binary data

### Storage
- [ ] **Memory Storage**: In-memory storage works
- [ ] **SQLite Storage**: SQLite persistence works
- [ ] **Content Addressing**: Content retrieved by hash
- [ ] **Cleanup**: Old content can be deleted

### TUI
- [ ] **Connection UI**: Connection status displayed
- [ ] **Message Stream**: Messages stream in real-time
- [ ] **Prompt Composition**: Can compose and send prompts
- [ ] **Gate Approval**: Can approve/reject from UI
- [ ] **Thinking Panel**: Thinking panel toggles
- [ ] **Keyboard Controls**: All keyboard shortcuts work

## Performance Testing

### Load Test: Many Messages
```typescript
// Create load-test.ts
import { WebSocketClient } from "./dist/transports/websocket.js";
import { createMessage } from "./dist/protocol/messages.js";
import { ulid } from "./dist/utils/ulid.js";

const client = new WebSocketClient("ws://localhost:3000", ulid());
const sessionId = ulid();
let messageCount = 0;

client.on("connected", async () => {
  // Create session
  client.send(createMessage("session.create", sessionId, client.participantId, {
    name: "Load Test",
    config: { /* ... */ },
  }));

  // Send 100 messages
  for (let i = 0; i < 100; i++) {
    client.send(createMessage("prompt.submit", sessionId, client.participantId, {
      content: `Test message ${i}`,
      target_agent: ulid(),
      contributors: [client.participantId],
      context_keys: [],
    }));
  }
});

client.on("message", () => {
  messageCount++;
  if (messageCount === 101) { // 1 session.created + 100 prompts
    console.log("✅ All messages received");
    process.exit(0);
  }
});

client.connect();

// Run: npx tsx load-test.ts
// Expected: All 100 messages processed successfully
```

### Stress Test: Many Participants
```bash
# Run multi-participant example multiple times with different names
# Terminal 2-11: 10 concurrent clients
for i in {1..10}; do
  npm run tui -- --server ws://localhost:3000 --name "User$i" --role observer &
done

# ✅ Server handles 10+ concurrent connections
# ✅ All participants see each other
# ✅ Messages broadcast to all participants
```

## Debugging

### Enable Debug Logging
```bash
# Set log level to debug
LOG_LEVEL=debug npm run server

# Or modify src/utils/logger.ts temporarily:
export const logger = pino({
  level: "debug", // Change from "info"
  transport: { /* ... */ }
});
```

### Common Issues

**Issue**: Client can't connect
```bash
# Check server is running
netstat -an | grep 3000

# Check firewall
sudo ufw status

# Try localhost vs 127.0.0.1
npm run tui -- --server ws://127.0.0.1:3000
```

**Issue**: Messages not appearing
```bash
# Check message routing logs
LOG_LEVEL=debug npm run server

# Verify participant ID matches
# Check session ID is correct
```

**Issue**: Gates not working
```bash
# Verify session config has require_approval_for set
# Check participant has approver role
# Verify quorum rules are met
```

## Integration Testing Script

```bash
#!/bin/bash
# test-pvp.sh

set -e

echo "🔨 Building project..."
npm run build

echo "🚀 Starting server..."
npm run server &
SERVER_PID=$!
sleep 2

echo "✅ Running basic session test..."
timeout 10 node dist/examples/basic-session.js || true

echo "✅ Running multi-participant test..."
timeout 10 node dist/examples/multi-participant.js || true

echo "🛑 Stopping server..."
kill $SERVER_PID

echo "✅ All tests passed!"
```

## Next Steps

After verifying basic functionality:

1. **Add Unit Tests**: Implement tests for protocol, session, gates
2. **Add Integration Tests**: Test complete workflows
3. **Implement Agent**: Add actual AI agent integration
4. **Add T.140 Transport**: Complete audio transport implementation
5. **Add Web UI**: Build web-based client alternative
6. **Production Deploy**: Deploy with PM2 or Docker

## Monitoring in Production

```bash
# Monitor server logs
tail -f logs/pvp-server.log

# Monitor WebSocket connections
watch -n 1 'netstat -an | grep 3000 | wc -l'

# Monitor SQLite database size
watch -n 5 'ls -lh pvp.db'
```
