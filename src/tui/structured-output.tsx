import React from "react";
import { Box, Text } from "ink";

type NuOutputShape = "table" | "record" | "grouped" | "list" | "tree" | "raw";

function detectShape(data: unknown): NuOutputShape {
  if (data === null || data === undefined) return "raw";
  if (Array.isArray(data)) {
    if (data.length === 0) return "list";
    if (typeof data[0] === "string") return "list";
    if (typeof data[0] === "object") return "table";
    return "list";
  }
  if (typeof data === "object") {
    const values = Object.values(data as Record<string, unknown>);
    if (values.length > 0 && Array.isArray(values[0])) return "grouped";
    const hasNested = values.some(v => typeof v === "object" && v !== null && !Array.isArray(v));
    if (hasNested) return "tree";
    return "record";
  }
  return "raw";
}

/**
 * Format a value for human-readable display.
 * Handles bytes → KB/MB, nanosecond durations, booleans, etc.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Truncate a string to maxLen, adding … if truncated.
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

// ============================================================
// Table Renderer — for T[] (ls, ps, sys disks, etc.)
// ============================================================

function TableRenderer({ data }: { data: Record<string, unknown>[] }): React.ReactElement {
  if (data.length === 0) return <Text dimColor>{"(empty table)"}</Text>;

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

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {cols.map((col, i) => (
          <Box key={col} width={widths[i]} marginRight={1}>
            <Text bold color="cyan">{truncate(col, widths[i])}</Text>
          </Box>
        ))}
      </Box>
      {/* Separator */}
      <Text dimColor>{cols.map((_, i) => "─".repeat(widths[i])).join(" ")}</Text>
      {/* Rows */}
      {displayData.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {cols.map((col, i) => (
            <Box key={col} width={widths[i]} marginRight={1}>
              <Text>{truncate(formatValue(row[col]), widths[i])}</Text>
            </Box>
          ))}
        </Box>
      ))}
      {truncated && <Text dimColor>{`  … and ${data.length - 20} more rows`}</Text>}
    </Box>
  );
}

// ============================================================
// Record Renderer — for single objects (sys host, version)
// ============================================================

function RecordRenderer({ data }: { data: Record<string, unknown> }): React.ReactElement {
  const entries = Object.entries(data);
  const maxKeyLen = entries.reduce((max, [k]) => Math.max(max, k.length), 0);

  return (
    <Box flexDirection="column">
      {entries.map(([key, value]) => (
        <Box key={key}>
          <Text dimColor>{key.padEnd(maxKeyLen)} : </Text>
          <Text>{truncate(formatValue(value), 80)}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ============================================================
// List Renderer — for string[] (glob, lines)
// ============================================================

function ListRenderer({ data }: { data: string[] }): React.ReactElement {
  if (data.length === 0) return <Text dimColor>{"(empty list)"}</Text>;

  const displayData = data.slice(0, 30);
  const truncatedList = data.length > 30;

  return (
    <Box flexDirection="column">
      {displayData.map((item, i) => (
        <Text key={i}>  • {item}</Text>
      ))}
      {truncatedList && <Text dimColor>{`  … and ${data.length - 30} more items`}</Text>}
    </Box>
  );
}

// ============================================================
// Grouped Renderer — for Record<string, T[]> (group-by)
// ============================================================

function GroupedRenderer({ data }: { data: Record<string, unknown[]> }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {Object.entries(data).map(([group, items]) => (
        <Box key={group} flexDirection="column" marginBottom={1}>
          <Text bold dimColor>{`── ${group} (${items.length} items) ──`}</Text>
          {Array.isArray(items) && items.length > 0 && typeof items[0] === "object" ? (
            <TableRenderer data={items as Record<string, unknown>[]} />
          ) : (
            <ListRenderer data={items.map(i => formatValue(i))} />
          )}
        </Box>
      ))}
    </Box>
  );
}

// ============================================================
// Tree/JSON Renderer — fallback for nested objects
// ============================================================

function TreeRenderer({ data }: { data: unknown }): React.ReactElement {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split("\n").slice(0, 30);
  const truncatedJson = json.split("\n").length > 30;

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} dimColor>{line}</Text>
      ))}
      {truncatedJson && <Text dimColor>  … (truncated)</Text>}
    </Box>
  );
}

// ============================================================
// Main StructuredOutput component
// ============================================================

export function StructuredOutput({ data }: { data: unknown }): React.ReactElement {
  const shape = detectShape(data);

  switch (shape) {
    case "table":
      return <TableRenderer data={data as Record<string, unknown>[]} />;
    case "record":
      return <RecordRenderer data={data as Record<string, unknown>} />;
    case "list":
      return <ListRenderer data={data as string[]} />;
    case "grouped":
      return <GroupedRenderer data={data as Record<string, unknown[]>} />;
    case "tree":
      return <TreeRenderer data={data} />;
    default:
      return <Text dimColor>{String(data)}</Text>;
  }
}
