#!/usr/bin/env bun
/**
 * PVP Agent CLI - Requires Bun runtime
 *
 * Usage:
 *   pvp-agent --server ws://localhost:3000 --session <id>
 *   pvp-agent --server wss://ws.pvp.codes --session <id> --local
 */

// The agent module handles its own CLI parsing
import "../dist/agent/index.js";
