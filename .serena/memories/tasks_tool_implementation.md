# Tasks Tool Implementation

## Overview
Implemented a new "tasks" tool for the PVP agent that enables session-level task and goal management. The agent can now maintain awareness of:
- **Session goals**: The primary objective being worked towards
- **Task lists**: Explicit todo items that need to be completed
- **Progress tracking**: What's done, what's in progress, what's pending

## Files Created/Modified

### New File: `src/agent/tools/tasks-tool.ts`
Complete implementation of the tasks tool with:
- Task interface (id, title, description, status, priority, timestamps)
- SessionGoal interface for primary session objectives
- Operations: add, update, complete, remove, list, clear, set_goal, get_goal
- TasksToolHandler interface with proposeTasksOperation() and executeTasksOperation()
- createTasksToolHandler() factory function
- getContextSummary() method for providing task awareness to agents

### Modified: `src/agent/claude-agent.ts`
- Added import for tasks-tool.ts
- Added tasksToolHandler property and tasksProposals Map
- Initialized handler in constructor
- Added tasks tool definition in getAllTools() with full JSON schema
- Added proposeTasksOperation() public method
- Added executeTasks() private method
- Added handler routing in handleToolExecution()
- Added tool_use handling in handlePrompt()

## Tool API

### Operations
| Operation | Description | Required Args |
|-----------|-------------|---------------|
| add | Create new task | title |
| update | Modify existing task | task_id |
| complete | Mark task as done | task_id |
| remove | Delete a task | task_id |
| list | Show all tasks | - |
| clear | Remove all tasks | - |
| set_goal | Set session objective | goal |
| get_goal | Get current goal | - |

### Risk Level
- Set to "low" (no I/O, just state management)
- requires_approval: false (safe operations)

## Usage Example
When prompters inform the agent of goals/tasks, the agent can:
1. `set_goal` to establish the session objective
2. `add` tasks as they're identified
3. `update` status to "in_progress" when starting work
4. `complete` tasks when finished
5. `list` to review remaining work
