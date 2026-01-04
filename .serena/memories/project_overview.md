# PVP - Pair Vibecoding Protocol

## Purpose
PVP is a multiplayer, role-based coordination protocol for human-AI collaborative development. It is NOT a chatbot - it's a coordination layer where multiple humans and AI agents collaborate in real-time.

## Core Philosophy
- The code is a side effect; the real artifact is the recorded, auditable stream of human decisions mediated by AI execution
- Human-in-the-loop safety model with approval gates for high-risk operations
- Real-time multiplayer collaboration with role-based access control

## Key Features
- Real-time multiplayer collaboration via WebSocket
- Role-based access control: driver, navigator, adversary, observer, approver, admin
- Approval gates for high-risk operations (shell execution, file writes, deploys)
- Live streaming of AI thinking and responses
- Context sharing and management between participants
- Session forking and merging for parallel exploration
- Interrupt mechanisms for human intervention

## Components
| Component | Runtime | Purpose |
|-----------|---------|---------|
| Server | Node.js | WebSocket server, session management |
| TUI | Node.js | Terminal user interface client (Ink/React) |
| Agent | Bun | Claude AI agent with shell execution |

## Why Bun for Agent?
The agent uses Bun.spawn for secure command execution:
- Array-based arguments prevent shell injection
- Native subprocess streaming
- Built-in timeout and buffer limits
