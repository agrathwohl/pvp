# Code Style & Conventions

## TypeScript Configuration
- Target: ES2022
- Module: NodeNext
- Strict mode: enabled
- JSX: react-jsx (for Ink TUI components)

## Naming Conventions
- **Files**: kebab-case (e.g., `claude-agent.ts`, `shell-executor.ts`)
- **Classes**: PascalCase (e.g., `ClaudeAgent`, `SessionManager`)
- **Interfaces**: PascalCase (e.g., `SessionConfig`, `ParticipantState`)
- **Functions/Methods**: camelCase (e.g., `handleMessage`, `createGate`)
- **Variables**: camelCase
- **Constants/Types**: PascalCase or UPPER_CASE for Zod schemas

## Pattern: Zod Schemas for Types
Types are defined using Zod schemas with inferred TypeScript types:
```typescript
const SessionConfig = z.object({...});
type SessionConfig = z.infer<typeof SessionConfig>;
```

## Project Structure
```
src/
├── agent/          # Claude AI agent (Bun runtime)
│   ├── tools/      # Shell execution tools
│   ├── claude-agent.ts
│   └── index.ts
├── protocol/       # Message types & protocol definitions
│   ├── types.ts    # Zod schemas for all message types
│   ├── messages.ts # Message creation utilities
│   └── defaults.ts
├── server/         # WebSocket server components
│   ├── session.ts  # Session management
│   ├── gates.ts    # Approval gate logic
│   ├── participant.ts
│   └── router.ts
├── storage/        # Persistence layer
├── transports/     # WebSocket transport
├── tui/            # Terminal UI (Ink/React)
└── utils/          # Logging, ULID, hashing
```

## Dependencies
- `@anthropic-ai/sdk` - Claude API client
- `ws` - WebSocket implementation
- `zod` - Runtime type validation
- `ink` / `react` - Terminal UI
- `pino` - Structured logging
- `ulid` - Unique identifiers
