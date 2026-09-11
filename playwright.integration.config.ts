import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration", workers: 1, timeout: 60_000,
  use: { baseURL: "http://localhost:3106", browserName: "chromium", channel: "msedge", viewport: { width: 390, height: 844 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: { command: "npm run dev -- --port 3106", url: "http://localhost:3106/login", reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_PUBLIC_KAKAO_JS_KEY: "integration-ui-fake-key" } },
});
