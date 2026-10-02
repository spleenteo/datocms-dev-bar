import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL: "http://localhost:5173" },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: !process.env.CI, timeout: 30_000 },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // devbar.example resolves to the playground: a non-local host for the host guard test.
        launchOptions: { args: ["--host-resolver-rules=MAP devbar.example 127.0.0.1"] },
      },
    },
  ],
});
