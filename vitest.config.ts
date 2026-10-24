import { defineConfig } from "vitest/config";

// Browser tests under web/e2e run with Playwright, not Vitest.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
