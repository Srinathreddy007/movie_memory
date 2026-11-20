import { execSync } from "node:child_process";

/** Runs once before all tests: bring the test DB schema up to date. */
export default function setup() {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
