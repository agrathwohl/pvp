# Suggested Commands

## Development Commands

### Build
```bash
npm run build          # TypeScript compilation (tsc)
```

### Running Components
```bash
npm run server         # Start WebSocket server (Node.js)
npm run server -- --port 3000 --host 0.0.0.0

npm run tui            # Start TUI client (Node.js)
npm run tui -- --server ws://localhost:3000 --name "Alice" --role driver

npm run agent          # Start Claude agent (Bun - REQUIRED)
npm run agent -- --server ws://localhost:3000 --session <session-id>
```

### Development Mode
```bash
npm run dev            # Watch mode for server (tsx watch)
```

### Testing
```bash
npm test               # Run tests (vitest)
```

## Important Notes
- **Agent MUST use Bun**: `npm run agent` uses `bun run src/agent/index.ts`
- **Do NOT run agent with tsx or Node.js** - will fail with module errors
- **ANTHROPIC_API_KEY** required for agent (env var or --api-key flag)

## System Commands (Linux)
- `git`, `ls`, `cd`, `grep`, `find` - standard Linux commands available
