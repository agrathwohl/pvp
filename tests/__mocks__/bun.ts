/**
 * Mock for Bun module when running tests under Vitest/Node
 * Only provides stubs for the APIs used in shell-executor.ts
 */

export interface Subprocess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill(): void;
}

export function spawn(
  _cmd: string[],
  _options?: {
    stdout?: "pipe" | "ignore";
    stderr?: "pipe" | "ignore";
    stdin?: "pipe" | "ignore";
    cwd?: string;
  }
): Subprocess {
  throw new Error("Bun.spawn is not available in Vitest environment. Use integration tests with Bun runtime.");
}
