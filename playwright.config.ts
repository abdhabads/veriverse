import { defineConfig } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "cross-env NODE_ENV=test npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      MONGO_URI: "mongodb://127.0.0.1:27017/veriverse_test",
      JWT_SECRET: "test_jwt_secret_change_me",
      AI_ENABLED: "false",
      AI_FAIL_OPEN: "true",
      CAPTCHA_ENABLED: "false",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
});
