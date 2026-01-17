# Notebook Tool Implementation

## Overview
Implemented a new `notebook_execute` tool for the PVP agent that executes Jupyter notebooks and converts them to HTML for rendering in pvp.codes.

## Files Created/Modified

### New File: `src/agent/tools/notebook-tool.ts`
- `NotebookToolHandler` interface with `proposeNotebookExecute` and `executeNotebook` methods
- Uses `jupyter nbconvert --execute --to html` via shell executor
- Supports output formats: html, markdown, pdf
- Risk level: high (requires approval due to arbitrary code execution)
- Emits `context.update` with key `notebook:rendered:{filename}` containing the HTML content
- Emits `context.add` with output file path metadata

### Modified: `src/agent/claude-agent.ts`
- Added `notebookToolHandler` property and `notebookProposals` Map
- Added `proposeNotebookExecute()` public method
- Added `executeNotebook()` private method
- Added `notebook_execute` tool definition in `getAllTools()`
- Added handling in `proposeToolBatch()` for `notebook_execute` tool
- Added handling in `handleToolExecution()` to route notebook proposals
- Added session working directory creation (`mkdir -p /tmp/pvp-git/{sessionId}`) in `joinSession()`

## Context Update Integration
The notebook tool emits a `context.update` message after successful execution:
- Key: `notebook:rendered:{output_filename}` (e.g., `notebook:rendered:analysis.html`)
- Content: Full HTML string from nbconvert output
- Reason: Description of the execution

pvp.codes can detect these context updates by checking for keys starting with `notebook:rendered:` and render the HTML content in an iframe or sanitized div.

## Tool Definition (for Claude)
```json
{
  "name": "notebook_execute",
  "description": "Execute a Jupyter notebook and convert it to HTML for rendering...",
  "input_schema": {
    "properties": {
      "notebook_path": { "type": "string" },
      "output_format": { "type": "string", "enum": ["html", "markdown", "pdf"] }
    },
    "required": ["notebook_path"]
  }
}
```
