import { defineConfig, devices } from '@playwright/test'

const PORT = 4322
// Matches astro.config.mjs's default `base` (and tests/e2e/helpers.ts's
// BASE_PATH) — the app doesn't serve anything at the bare domain root.
const BASE_PATH = '/starter-local-astro'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // Deliberately not overriding BASE_PATH: the app's own default
    // ('/starter-local-astro') matches how it's actually deployed (a GitHub
    // Pages project site). Testing at the domain root surfaced a latent
    // double-slash bug in a couple of hardcoded asset URLs (NavBarMenu.astro,
    // pageRegistry.ts's csvUrl/geojsonUrl) that only manifests when
    // BASE_URL is exactly '/' — see the note left for the app maintainer.
    command: `pnpm exec astro dev --port ${PORT}`,
    url: `http://localhost:${PORT}${BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
