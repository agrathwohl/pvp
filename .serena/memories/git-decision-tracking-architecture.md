# Git Decision Tracking Architecture for pvp.codes

## Source Implementation Analysis (../pvp)

### Core Types (decision-types.ts)
- **DecisionCommit**: Links git commits to PVP conversations
  - git_sha, git_branch, git_parents
  - pvp_session, pvp_fork, pvp_messages
  - decision_summary, decision_rationale, decision_type
  - confidence_score (0.0-1.0), confidence_level
  - alternatives_considered, assumptions, risks
  - tool_executions[], approvals[], files_changed[]

- **DecisionTree**: Represents branching decision history
  - Maps PVP sessions → git repositories
  - Maps PVP forks → git branches
  - Maps PVP messages → git commits (many-to-one)
  - Contains DecisionBranch[], DecisionMerge[]

- **ConversationThread**: Serializable conversation storage
  - CompactMessage[] with type, content, sender
  - Can be stored in git-notes, trailers, or external storage

### Bridge Service (bridge-service.ts)
- Local daemon maintaining session state
- Unix socket (/tmp/pvp-git-bridge.sock) + HTTP API (port 9847)
- Tracks: session_id, participants, messages, tool_executions
- Provides: /commit-context, /extended-metadata, /status

### Git Hooks
- prepare-commit-msg: Embeds PVP metadata
- post-commit: Stores extended data in git-notes
- pre-push: Validates decision trail

## Web Application Requirements

### Required Components:
1. **GitTreeViewer**: Visual git tree with branch relationships
2. **CommitDiffViewer**: Code/document changes display
3. **DecisionContextPanel**: Metadata and decision details
4. **GitRepositoryState**: Real-time repo state tracker

### WebSocket Messages to Handle:
- git.commit_created
- git.branch_created
- git.branch_switched
- git.merge_completed
- git.decision_linked

### State Management:
- Current branch, commit history, file changes
- Decision metadata per commit
- Tool execution history
- Approval records
