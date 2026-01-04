# Task Completion Checklist

## Before Completing Any Task

### 1. Type Checking
```bash
npm run build
```
Ensure no TypeScript errors.

### 2. Test (if applicable)
```bash
npm test
```
Run vitest tests to ensure no regressions.

### 3. Runtime Verification
- **Server changes**: Test with `npm run server`
- **Agent changes**: Test with `npm run agent` (Bun required)
- **TUI changes**: Test with `npm run tui`

## Critical Reminders
- Agent component MUST be run with Bun, not Node.js/tsx
- All messages follow the PVP protocol envelope structure
- Tool proposals flow through gate approval system for safety
- Preserve human-in-the-loop approval patterns in any modifications
