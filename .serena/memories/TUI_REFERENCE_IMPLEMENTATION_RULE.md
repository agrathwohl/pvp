# TUI as Reference Implementation - CRITICAL PROJECT RULE

## Mandatory Requirement

**ANYTIME there is a new server feature added, the TUI MUST be updated to support/demonstrate it as well.**

The TUI (`src/tui/`) serves as the **reference implementation** for the PVP protocol.

## Rationale

1. The TUI is the canonical example of how to implement a PVP client
2. It demonstrates correct protocol handling for all message types
3. It serves as a testing ground for new features before they go to external clients
4. If a feature works in the TUI, it proves the server implementation is correct

## Files to Update

When adding new server features, always update:

- `src/tui/store.ts` - Message handling, state management
- `src/tui/app.tsx` - UI rendering, user interactions
- `src/tui/index.ts` - CLI entry point if new options needed

## Example: Gate System Bug (January 2026)

Both the web frontend (`pvp.codes/app/page.tsx`) and the TUI had the same bug where gates were stored using the `gate.request` message ID instead of the `tool.propose` message ID (`action_ref`). 

This caused "Gate not found" errors when approving tool executions.

Fix applied to both:
```typescript
// WRONG: pendingGates.set(message.id, gate)
// CORRECT: pendingGates.set(message.payload.action_ref, gate)
```

## Checklist for New Features

- [ ] Server feature implemented and tested
- [ ] TUI updated to handle new message types
- [ ] TUI demonstrates the feature in the UI
- [ ] Integration tests cover TUI usage of the feature
