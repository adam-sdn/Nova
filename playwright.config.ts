import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // Every spec shares one dev server and one database, and some reset it: run them one at a time.
  workers: 1,
  fullyParallel: false,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // E2E_PROD=1 runs against a production build, which has no first-request compile delay (use it to check A4).
    command: process.env.E2E_PROD ? `npm run build && npm start -- -p ${port}` : `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DB_PATH: "./care-loop-e2e.db", MOCK_AI: "1" },
  },
});
