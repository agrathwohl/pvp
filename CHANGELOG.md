# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-07

### Added

#### Core Package
- Initial npm package release
- Programmatic APIs: `startServer()`, `startTUI()`, `startAgent()`
- CLI commands: `pvp`, `pvp-server`, `pvp-tui`, `pvp-agent`
- TypeScript type definitions for all public APIs
- ES Module exports with submodule support

#### Server (`pvp/server`)
- `PVPServer` class for session and connection management
- WebSocket transport with automatic reconnection
- Session management with multiple participants
- Heartbeat monitoring and presence tracking
- Bridge proxy for remote decision tracking

#### TUI (`pvp/tui`)
- Terminal user interface built with React/Ink
- Real-time message streaming display
- Tool proposal review interface
- Gate voting controls
- Decision tracking panel
- Zustand-based state management

#### Agent (`pvp/agent`)
- Claude AI agent with Anthropic API integration
- Native tool use with shell execution
- MCP (Model Context Protocol) server support
- Command safety categorization
- Approval gate integration
- **Requires Bun runtime** for secure shell execution

#### Protocol (`pvp/protocol`)
- 40+ message types for full protocol coverage
- Type-safe message creation with `createMessage()`
- Message serialization/deserialization utilities
- Decision tracking schemas
- Session configuration types

#### Transport (`pvp/transports`)
- `Transport` interface for client connections
- `TransportServer` interface for server-side handling
- `WebSocketTransport` implementation
- `WebSocketTransportServer` implementation

#### Git Integration (`pvp/git-hooks`)
- `PvpGitBridgeService` for decision tracking
- Git hooks: `prepare-commit-msg`, `post-commit`, `pre-push`
- Automatic commit metadata injection
- Extended metadata in git-notes
- HTTP API and Unix socket communication

### Documentation
- Comprehensive JSDoc on all public APIs
- API reference documentation (`docs/API.md`)
- Decision tracking architecture guide
- Git commit protocol specification
- README with quick start guide

### Infrastructure
- npm package configuration with proper exports
- ES Module build with TypeScript declarations
- CLI binary wrappers
- `.npmignore` for clean publishing

---

## Development Notes

### Runtime Requirements

| Component | Runtime | Reason |
|-----------|---------|--------|
| Server | Node.js 18+ | Standard WebSocket server |
| TUI | Node.js 18+ | Ink/React terminal rendering |
| Agent | Bun | `Bun.spawn` for secure shell execution |

### Breaking Changes Policy

This is version 0.1.0 - the API is not yet stable. Breaking changes may occur in minor versions until 1.0.0.

### Future Roadmap

- [ ] Web UI client
- [ ] T.140 audio transport integration
- [ ] MCP transport support
- [ ] Persistent session recovery
- [ ] Message replay functionality
- [ ] Decision tree visualization
