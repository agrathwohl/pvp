# Claude AI Agent Setup

## Quick Start

### 1. Get Your API Key

1. Go to https://console.anthropic.com/
2. Sign in with `andrew@grathwohl.me`
3. Navigate to **API Keys**
4. Create a new key (you have $5 free credits)
5. Copy the key (starts with `sk-ant-...`)

### 2. Set Your API Key

```bash
# Option 1: Environment variable (recommended)
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Option 2: Pass via flag (see below)
```

### 3. Run the Complete Flow

```bash
# Terminal 1: Start the server
npm run server

# Terminal 2: Start a human participant (Alice)
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

# Copy the session ID from Alice's terminal output
# Example: 01KDSB7634NYJYQBRVW0YH064Y

# Terminal 3: Start the Claude agent
npm run agent -- --server ws://localhost:3000 --session 01KDSB7634NYJYQBRVW0YH064Y

# Or with explicit API key:
npm run agent -- --server ws://localhost:3000 --session 01KDSB7634NYJYQBRVW0YH064Y --api-key sk-ant-...
```

### 4. Send Prompts to the Agent

In Alice's TUI:
1. Press `p` to enter prompt mode
2. Type your prompt: "Hello Claude, explain what PVP is"
3. Press `Ctrl+Enter` to send

The agent will:
- Receive the prompt
- Stream thinking process
- Stream response back to all participants

## How It Works

```
┌─────────────┐       ┌─────────────┐       ┌──────────────┐
│   Alice     │──────▶│  PVP Server │◀──────│ Claude Agent │
│   (Human)   │       │ (WebSocket) │       │   (AI)       │
└─────────────┘       └─────────────┘       └──────────────┘
      │                      │                      │
      │   1. Submit Prompt   │                      │
      │─────────────────────▶│                      │
      │                      │  2. Broadcast Prompt │
      │                      │─────────────────────▶│
      │                      │                      │
      │                      │  3. Thinking Start   │
      │◀─────────────────────│◀─────────────────────│
      │                      │                      │
      │                      │  4. Response Stream  │
      │◀─────────────────────│◀─────────────────────│
      │                      │                      │
```

## Agent Features

### ✅ Implemented
- WebSocket connection to PVP server
- Session joining
- Prompt handling with streaming responses
- Thinking/response lifecycle
- Interrupt handling
- Conversation history

### 🚧 Not Implemented Yet
- Tool execution (gates will be created but not executed)
- Context awareness
- Fork/merge support
- Multi-turn conversations with context

## Configuration Options

```bash
npm run agent -- \
  --server ws://localhost:3000 \     # WebSocket server URL
  --session <SESSION_ID> \            # Session to join
  --name "Claude Assistant" \         # Agent display name
  --model claude-sonnet-4-5-20250929 \ # Claude model
  --api-key sk-ant-...                # API key (or use env var)
```

## Troubleshooting

### "API key required"
```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-ant-your-key"

# Or pass explicitly
npm run agent -- --server ws://localhost:3000 --session <ID> --api-key sk-ant-...
```

### "Cannot find module '@anthropic-ai/sdk'"
```bash
npm install
npm run build
```

### "Agent not responding to prompts"
- Make sure you're sending prompts from the TUI (press `p`, type, `Ctrl+Enter`)
- Check that both human and agent are in the same session
- Verify the agent shows "Participants: 2" in the header

### "No participants showing"
- Rebuild: `npm run build`
- Restart server and clients
- Make sure you're using the correct session ID

## API Usage & Costs

With free credits:
- **$5 credit** = ~20M input tokens + ~4M output tokens
- **Sonnet 3.5**: $3 per million input tokens, $15 per million output tokens
- A typical conversation: ~$0.01 - $0.05

Monitor usage at: https://console.anthropic.com/settings/usage
