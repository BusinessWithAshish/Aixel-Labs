import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { E2E_ARTIFACTS_DIR, E2E_DEV, E2E_DIST_DIR, E2E_WORKERS, e2ePort, e2eServerEnv } from './e2e/support/env';

const isCI = !!process.env.CI;

if (!E2E_DEV && !existsSync(path.join(__dirname, E2E_DIST_DIR, 'BUILD_ID'))) {
    throw new Error(`No e2e build in ${E2E_DIST_DIR}/. Run \`pnpm e2e:build\` first, or set E2E_DEV=1 to use \`next dev\`.`);
}

export default defineConfig({
    testDir: './e2e',
    outputDir: path.join(E2E_ARTIFACTS_DIR, 'results'),
    globalSetup: './e2e/global-setup.ts',
    // Every worker has its own app server and database (see `e2e/support/env.ts`), so tests spread freely.
    fullyParallel: true,
    workers: E2E_WORKERS,
    forbidOnly: isCI,
    // A trace costs ~25% of the suite's time when every test records one, so only a retry records it.
    retries: 1,
    // `next dev` compiles each route on first hit. A production build does not, but leave room for a busy box.
    timeout: E2E_DEV ? 90_000 : 60_000,
    expect: { timeout: 15_000 },
    reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: path.join(E2E_ARTIFACTS_DIR, 'report') }]] : 'list',
    use: {
        navigationTimeout: E2E_DEV ? 60_000 : 30_000,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            testMatch: '**/*.spec.ts',
            // `LOCAL_FETCH` tests need `next dev` (see `e2e/support/fixtures.ts`): `pnpm e2e` runs them after.
            grepInvert: E2E_DEV ? undefined : /@local-fetch/,
            use: { ...devices['Desktop Chrome'] },
        },
        // Screenshot tour for visual review, run on demand: `pnpm e2e:walkthrough`.
        { name: 'walkthrough', testMatch: '**/*.walkthrough.ts', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: Array.from({ length: E2E_WORKERS }, (_, worker) => ({
        command: E2E_DEV
            ? `pnpm exec next dev --port=${e2ePort(worker)}`
            : `pnpm exec next start --port=${e2ePort(worker)}`,
        url: `http://localhost:${e2ePort(worker)}/api/mongo-health-check`,
        env: { ...e2eServerEnv(worker), ...(E2E_DEV ? {} : { NEXT_DIST_DIR: E2E_DIST_DIR }) },
        // A leftover production server may be serving an older build: start fresh, fail if the port is taken.
        reuseExistingServer: E2E_DEV && !isCI,
        timeout: 180_000,
        stdout: 'ignore' as const,
        stderr: 'pipe' as const,
    })),
});
