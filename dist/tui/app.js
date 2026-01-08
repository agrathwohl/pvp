import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { useTUIStore } from "./store.js";
export function App({ serverUrl, sessionId, participantId, participantName, role, isCreator, }) {
    const { exit } = useApp();
    const { connected, messages, participants, pendingGates, toolProposals, toolOutputs, decisionTracking, mode, draftPrompt, currentThinking, currentResponse, error, debugLog, debugVisible, connect, disconnect, updateDraft, submitPrompt, approveGate, approveAllGates, rejectGate, rejectAllGates, setMode, toggleThinking, toggleDebug, fetchDecisionTracking, } = useTUIStore();
    const [targetAgent, setTargetAgent] = useState("");
    // Get message target (prefer agents, fall back to other humans)
    const getMessageTarget = () => {
        const otherParticipants = Array.from(participants.values()).filter((p) => p.info.id !== participantId);
        const agents = otherParticipants.filter((p) => p.info.type === "agent");
        return agents.length > 0 ? agents[0] : otherParticipants[0];
    };
    useEffect(() => {
        connect(serverUrl, sessionId, participantId, participantName, role, isCreator);
        return () => {
            disconnect();
        };
    }, [serverUrl, sessionId, participantId, participantName, role, isCreator]);
    // Poll decision tracking state from bridge service
    useEffect(() => {
        if (!connected)
            return;
        // Initial fetch
        fetchDecisionTracking();
        // Poll every 5 seconds
        const interval = setInterval(() => {
            fetchDecisionTracking();
        }, 5000);
        return () => clearInterval(interval);
    }, [connected, fetchDecisionTracking]);
    useInput((input, key) => {
        if (key.ctrl && input === "c") {
            exit();
            return;
        }
        // GATE CONTROLS - Work from ANY mode when gates are pending
        if (pendingGates.size > 0) {
            const gates = Array.from(pendingGates.entries());
            const [gateId] = gates[0];
            if (input === "a") {
                approveGate(gateId);
                return;
            }
            else if (input === "A") {
                approveAllGates("Batch approved by user");
                return;
            }
            else if (input === "r") {
                rejectGate(gateId, "Rejected by user");
                return;
            }
            else if (input === "R") {
                rejectAllGates("Batch rejected by user");
                return;
            }
        }
        // MODE-SPECIFIC CONTROLS
        if (mode === "stream") {
            if (input === "p") {
                // Block compose mode if there are pending gates
                if (pendingGates.size > 0) {
                    return;
                }
                setMode("compose");
            }
            else if (input === "t") {
                toggleThinking();
            }
            else if (input === "d") {
                toggleDebug();
            }
        }
        else if (mode === "compose") {
            if (key.escape) {
                setMode("stream");
                updateDraft("");
            }
            else if (key.return) {
                const target = getMessageTarget();
                if (target && draftPrompt.trim().length > 0) {
                    submitPrompt(target.info.id);
                }
            }
            else if (key.backspace || key.delete) {
                updateDraft(draftPrompt.slice(0, -1));
            }
            else if (!key.ctrl && !key.meta && input) {
                updateDraft(draftPrompt + input);
            }
        }
    });
    const agents = Array.from(participants.values()).filter((p) => p.info.type === "agent");
    const humans = Array.from(participants.values()).filter((p) => p.info.type === "human");
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsx(Box, { borderStyle: "single", borderColor: pendingGates.size > 0 ? "red" : "white", paddingX: 1, children: _jsxs(Text, { children: ["PVP Session ", sessionId.slice(0, 8), "...", " ", connected ? (_jsx(Text, { color: "green", children: "\u25CF" })) : (_jsx(Text, { color: "red", children: "\u25CB" })), " ", "| Participants: ", participants.size, pendingGates.size > 0 ? (_jsxs(Text, { color: "red", bold: true, inverse: true, children: [" | \uD83D\uDEA8 ", pendingGates.size, " GATE", pendingGates.size > 1 ? "S" : "", " PENDING "] })) : (_jsx(Text, { children: " | Gates: 0" }))] }) }), decisionTracking.bridgeConnected && (_jsx(Box, { borderStyle: "round", borderColor: "cyan", paddingX: 1, children: _jsxs(Text, { children: [_jsx(Text, { color: "cyan", children: "\uD83D\uDCCA Decision Tracking" }), " | ", "Msgs: ", decisionTracking.messagesSinceLastCommit, " | ", "Prompts: ", decisionTracking.promptsCount, " | ", "Approvals: ", decisionTracking.approvalsCount, decisionTracking.toolExecutions && (_jsxs(_Fragment, { children: [" | ", "Tools: ", decisionTracking.toolExecutions] })), decisionTracking.lastCommit && (_jsxs(_Fragment, { children: [" | ", _jsxs(Text, { dimColor: true, children: ["Last: ", decisionTracking.lastCommit.slice(0, 7)] })] }))] }) })), _jsxs(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, paddingY: 1, children: [error && (_jsx(Box, { children: _jsxs(Text, { color: "red", children: ["ERROR: ", error] }) })), messages.slice(-20).map((msg, i) => (_jsxs(Box, { marginY: 0, children: [msg.type === "prompt.submit" && (_jsxs(Text, { children: [_jsxs(Text, { color: "blue", children: ["[", msg.sender, "]"] }), ": ", msg.payload.content] })), msg.type === "response.chunk" && (_jsx(Text, { color: "gray", children: msg.payload.text })), msg.type === "tool.propose" && (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: "yellow", children: ["\uD83D\uDD27 Tool Proposal: ", _jsx(Text, { bold: true, children: msg.payload.tool_name })] }), _jsxs(Text, { color: "yellow", dimColor: true, children: [" ", "\u2514\u2500 ", msg.payload.description] }), _jsxs(Text, { color: "yellow", dimColor: true, children: [" ", "\u2514\u2500 Risk: ", msg.payload.risk_level, " | Category: ", msg.payload.category] })] })), msg.type === "tool.execute" && (_jsx(Text, { color: "green", children: "\u2713 Tool approved - executing..." })), msg.type === "tool.output" && !msg.payload.complete && (_jsx(Text, { color: "cyan", dimColor: true, children: msg.payload.stream === "stderr" ? (_jsx(Text, { color: "red", children: msg.payload.text })) : (msg.payload.text) })), msg.type === "tool.result" && (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { color: msg.payload.success ? "green" : "red", children: [msg.payload.success ? "✓" : "✗", " Tool ", msg.payload.success ? "completed" : "failed", " ", "(", msg.payload.duration_ms, "ms)"] }), msg.payload.error && (_jsxs(Text, { color: "red", dimColor: true, children: [" ", "\u2514\u2500 Error: ", msg.payload.error] }))] })), msg.type === "gate.request" && (_jsxs(Text, { color: "red", children: ["\u26A0\uFE0F  ", msg.payload.message] }))] }, i))), currentResponse && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "cyan", children: ["Response: ", currentResponse] }) }))] }), currentThinking && (_jsx(Box, { borderStyle: "single", paddingX: 1, height: 8, children: _jsxs(Text, { dimColor: true, italic: true, children: ["Thinking: ", currentThinking] }) })), pendingGates.size > 0 && (_jsx(Box, { borderStyle: "double", borderColor: "red", paddingX: 1, marginY: 1, children: _jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { bold: true, color: "red", inverse: true, children: [" ", "\uD83D\uDEA8 ACTION REQUIRED: ", pendingGates.size, " PENDING GATE", pendingGates.size > 1 ? "S" : "", " \uD83D\uDEA8", " "] }), _jsx(Text, { color: "red", bold: true, children: "You MUST approve or reject before the agent can continue." }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: Array.from(pendingGates.entries()).map(([id, gate], index) => {
                                const toolProposal = gate.request.action_type === "tool"
                                    ? toolProposals.get(gate.request.action_ref)
                                    : null;
                                return (_jsxs(Box, { flexDirection: "column", marginTop: index > 0 ? 1 : 0, borderStyle: "single", borderColor: "yellow", paddingX: 1, children: [_jsxs(Text, { color: "yellow", bold: true, children: ["Gate #", index + 1, ": ", gate.request.message] }), _jsxs(Text, { color: "gray", children: ["Action Type: ", gate.request.action_type, " | Ref: ", gate.request.action_ref.slice(0, 12), "..."] }), toolProposal && (_jsxs(_Fragment, { children: [_jsxs(Text, { color: "cyan", children: ["Tool: ", _jsx(Text, { bold: true, children: toolProposal.tool_name }), " (", toolProposal.category, ")"] }), _jsxs(Text, { color: toolProposal.risk_level === "critical" ? "red" : toolProposal.risk_level === "high" ? "yellow" : "green", children: ["Risk Level: ", _jsx(Text, { bold: true, children: toolProposal.risk_level.toUpperCase() })] }), toolProposal.arguments.full_command && (_jsxs(Text, { color: "magenta", children: ["Command: ", _jsx(Text, { bold: true, children: String(toolProposal.arguments.full_command) })] })), toolProposal.description && (_jsxs(Text, { dimColor: true, children: ["Description: ", toolProposal.description] }))] })), _jsxs(Text, { dimColor: true, children: ["Approvals: ", gate.approvals.length, " | Rejections: ", gate.rejections.length] })] }, id));
                            }) }), _jsx(Box, { marginTop: 1, borderStyle: "round", borderColor: "green", paddingX: 1, children: _jsxs(Text, { bold: true, color: "white", children: ["CONTROLS:", " ", _jsx(Text, { color: "green", children: "[a]" }), " approve first", " ", _jsx(Text, { color: "green", children: "[A]" }), " approve ALL", " ", _jsx(Text, { color: "red", children: "[r]" }), " reject first", " ", _jsx(Text, { color: "red", children: "[R]" }), " reject ALL"] }) })] }) })), mode === "compose" && (_jsx(Box, { borderStyle: "single", paddingX: 1, children: _jsxs(Box, { flexDirection: "column", width: "100%", children: [_jsx(Text, { children: "Composing prompt (Enter to send, Esc to cancel):" }), _jsx(Text, { children: draftPrompt }), _jsx(Text, { color: "gray", children: (() => {
                                const target = getMessageTarget();
                                return target
                                    ? `Target: ${target.info.name} (${target.info.type})`
                                    : "No other participants";
                            })() })] }) })), _jsx(Box, { borderStyle: "single", borderColor: pendingGates.size > 0 ? "red" : "white", paddingX: 1, children: _jsxs(Text, { children: ["Participants:", " ", humans.map((p) => p.info.name).join(", "), " | ", "Agents: ", agents.map((p) => p.info.name).join(", "), " | ", "Mode: ", mode, pendingGates.size > 0 ? (_jsxs(_Fragment, { children: [" | ", _jsxs(Text, { color: "red", bold: true, children: ["\u26A0\uFE0F GATES: ", pendingGates.size] }), " | ", _jsx(Text, { color: "green", children: "[a]" }), "/", _jsx(Text, { color: "green", children: "[A]" }), " approve", " ", _jsx(Text, { color: "red", children: "[r]" }), "/", _jsx(Text, { color: "red", children: "[R]" }), " reject"] })) : (_jsxs(_Fragment, { children: [" | ", "Keys: [p]rompt [t]hinking [d]ebug [Ctrl+C]quit"] }))] }) }), debugVisible && debugLog.length > 0 && (_jsx(Box, { borderStyle: "single", borderColor: "magenta", paddingX: 1, children: _jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "magenta", children: "DEBUG LOG:" }), debugLog.map((log, i) => (_jsx(Text, { dimColor: true, children: log }, i)))] }) }))] }));
}
