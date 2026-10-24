import { defineConfig } from "@playwright/test";

// The smoke test (build plan §8): run it against the deployed app before every deploy,
//   SMOKE_URL=https://<live url> pnpm smoke
// or against `pnpm dev:web` + `pnpm dev:server` with no SMOKE_URL. Each test opens a
// fresh browser, so each one gets its own anonymous session and its own Demo world.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "tests/e2e/.results",
  use: {
    baseURL: process.env.SMOKE_URL ?? "http://localhost:5173",
    // The installed Chrome, as the brief's checks say; PLAYWRIGHT_CHANNEL="" uses Playwright's own Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
});
