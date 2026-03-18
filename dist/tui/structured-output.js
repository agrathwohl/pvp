import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function detectShape(data) {
    if (data === null || data === undefined)
        return "raw";
    if (Array.isArray(data)) {
        if (data.length === 0)
            return "list";
        if (typeof data[0] === "string")
            return "list";
        if (typeof data[0] === "object")
            return "table";
        return "list";
    }
    if (typeof data === "object") {
        const values = Object.values(data);
        if (values.length > 0 && Array.isArray(values[0]))
            return "grouped";
        const hasNested = values.some(v => typeof v === "object" && v !== null && !Array.isArray(v));
        if (hasNested)
            return "tree";
        return "record";
    }
    return "raw";
}
/**
 * Format a value for human-readable display.
 * Handles bytes → KB/MB, nanosecond durations, booleans, etc.
 */
function formatValue(value) {
    if (value === null || value === undefined)
        return "—";
    if (typeof value === "boolean")
        return value ? "yes" : "no";
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return String(value);
    if (Array.isArray(value))
        return `[${value.length} items]`;
    if (typeof value === "object")
        return JSON.stringify(value);
    return String(value);
}
/**
 * Truncate a string to maxLen, adding … if truncated.
 */
function truncate(s, maxLen) {
    if (s.length <= maxLen)
        return s;
    return s.slice(0, maxLen - 1) + "…";
}
// ============================================================
// Table Renderer — for T[] (ls, ps, sys disks, etc.)
// ============================================================
function TableRenderer({ data }) {
    if (data.length === 0)
        return _jsx(Text, { dimColor: true, children: "(empty table)" });
    const cols = Object.keys(data[0]);
    // Calculate column widths: max of header length or longest value, capped at 40
    const widths = cols.map(col => {
        const headerLen = col.length;
        const maxVal = data.reduce((max, row) => {
            const val = formatValue(row[col]);
            return Math.max(max, val.length);
        }, 0);
        return Math.min(Math.max(headerLen, maxVal) + 1, 40);
    });
    // Limit to 20 rows in TUI to prevent flooding
    const displayData = data.slice(0, 20);
    const truncated = data.length > 20;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { children: cols.map((col, i) => (_jsx(Box, { width: widths[i], marginRight: 1, children: _jsx(Text, { bold: true, color: "cyan", children: truncate(col, widths[i]) }) }, col))) }), _jsx(Text, { dimColor: true, children: cols.map((_, i) => "─".repeat(widths[i])).join(" ") }), displayData.map((row, rowIdx) => (_jsx(Box, { children: cols.map((col, i) => (_jsx(Box, { width: widths[i], marginRight: 1, children: _jsx(Text, { children: truncate(formatValue(row[col]), widths[i]) }) }, col))) }, rowIdx))), truncated && _jsx(Text, { dimColor: true, children: `  … and ${data.length - 20} more rows` })] }));
}
// ============================================================
// Record Renderer — for single objects (sys host, version)
// ============================================================
function RecordRenderer({ data }) {
    const entries = Object.entries(data);
    const maxKeyLen = entries.reduce((max, [k]) => Math.max(max, k.length), 0);
    return (_jsx(Box, { flexDirection: "column", children: entries.map(([key, value]) => (_jsxs(Box, { children: [_jsxs(Text, { dimColor: true, children: [key.padEnd(maxKeyLen), " : "] }), _jsx(Text, { children: truncate(formatValue(value), 80) })] }, key))) }));
}
// ============================================================
// List Renderer — for string[] (glob, lines)
// ============================================================
function ListRenderer({ data }) {
    if (data.length === 0)
        return _jsx(Text, { dimColor: true, children: "(empty list)" });
    const displayData = data.slice(0, 30);
    const truncatedList = data.length > 30;
    return (_jsxs(Box, { flexDirection: "column", children: [displayData.map((item, i) => (_jsxs(Text, { children: ["  \u2022 ", item] }, i))), truncatedList && _jsx(Text, { dimColor: true, children: `  … and ${data.length - 30} more items` })] }));
}
// ============================================================
// Grouped Renderer — for Record<string, T[]> (group-by)
// ============================================================
function GroupedRenderer({ data }) {
    return (_jsx(Box, { flexDirection: "column", children: Object.entries(data).map(([group, items]) => (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, dimColor: true, children: `── ${group} (${items.length} items) ──` }), Array.isArray(items) && items.length > 0 && typeof items[0] === "object" ? (_jsx(TableRenderer, { data: items })) : (_jsx(ListRenderer, { data: items.map(i => formatValue(i)) }))] }, group))) }));
}
// ============================================================
// Tree/JSON Renderer — fallback for nested objects
// ============================================================
function TreeRenderer({ data }) {
    const json = JSON.stringify(data, null, 2);
    const lines = json.split("\n").slice(0, 30);
    const truncatedJson = json.split("\n").length > 30;
    return (_jsxs(Box, { flexDirection: "column", children: [lines.map((line, i) => (_jsx(Text, { dimColor: true, children: line }, i))), truncatedJson && _jsx(Text, { dimColor: true, children: "  \u2026 (truncated)" })] }));
}
// ============================================================
// Main StructuredOutput component
// ============================================================
export function StructuredOutput({ data }) {
    const shape = detectShape(data);
    switch (shape) {
        case "table":
            return _jsx(TableRenderer, { data: data });
        case "record":
            return _jsx(RecordRenderer, { data: data });
        case "list":
            return _jsx(ListRenderer, { data: data });
        case "grouped":
            return _jsx(GroupedRenderer, { data: data });
        case "tree":
            return _jsx(TreeRenderer, { data: data });
        default:
            return _jsx(Text, { dimColor: true, children: String(data) });
    }
}
