import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    // Mock Bun module for tests since we run under Vitest/Node
    alias: {
      bun: new URL("./tests/__mocks__/bun.ts", import.meta.url).pathname,
    },
  },
});
