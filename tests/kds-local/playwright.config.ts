import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "kds.spec.ts", workers: 1,
  reporter: "list", timeout: 30000,
  use: { baseURL: "http://127.0.0.1:4175", viewport: { width: 1366, height: 768 }, channel: "msedge", headless: true },
  webServer: { command: "node tests/kds-local/servidor.mjs", cwd: process.cwd(), url: "http://127.0.0.1:4175/tests/kds-local/index.html", reuseExistingServer: false },
});
