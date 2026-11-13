import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "node e2e/seed.mjs && npm run dev",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { RADIANT_DATA_FILE: "data/e2e-store.json" },
  },
});
