import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "web/e2e",
  use: { baseURL: `http://localhost:${port}/warhammer-nameplates/` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Tests run against the production build, as deployed.
  webServer: {
    command: `npm run web:build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/warhammer-nameplates/`,
    reuseExistingServer: !process.env.CI,
  },
});
