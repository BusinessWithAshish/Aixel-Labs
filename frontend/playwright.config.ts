import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_ARTIFACTS_DIR, E2E_BASE_URL, E2E_PORT, e2eServerEnv } from './e2e/support/env';

const isCI = !!process.env.CI;

export default defineConfig({
    testDir: './e2e',
    outputDir: path.join(E2E_ARTIFACTS_DIR, 'results'),
    globalSetup: './e2e/global-setup.ts',
    // Specs share the seeded users (credit balance, lead lists), so they run one at a time.
    fullyParallel: false,
    workers: 1,
    forbidOnly: isCI,
    retries: isCI ? 1 : 0,
    // `next dev` compiles each route on first hit.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: path.join(E2E_ARTIFACTS_DIR, 'report') }]] : 'list',
    use: {
        baseURL: E2E_BASE_URL,
        navigationTimeout: 60_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', testMatch: '**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
        // Screenshot tour for visual review, run on demand: `pnpm e2e:walkthrough`.
        { name: 'walkthrough', testMatch: '**/*.walkthrough.ts', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: `pnpm exec next dev --port=${E2E_PORT}`,
        url: `http://localhost:${E2E_PORT}/api/mongo-health-check`,
        env: e2eServerEnv(),
        reuseExistingServer: !isCI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
