import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

// Tests wipe tables between cases, so they must never point at the dev DB.
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
if (testDbUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside Next's server bundler; it's a no-op in tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    env: { DATABASE_URL: testDbUrl },
    globalSetup: ["tests/global-setup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
  },
});
