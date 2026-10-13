import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { ACCOUNT_SETTINGS_ROUTE, SubModuleUrls, TENANT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { HIDDEN_SUB_MODULES } from '@/config/sidebar.config';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import {
    expectRunBlockedByValidation,
    fillRequiredFields,
    GOOGLE_ADVANCED_SEARCH_FORM,
    LEADS_URL,
    mockScrape,
    openLeadGenForm,
    saveAndRun,
    searchLeads,
} from '../support/lead-gen';
import { E2E_USER } from '../support/users';

/**
 * Not a pass/fail suite: visits every lead-generation screen and the main form states,
 * saves a screenshot of each, and records what a person would not see by eye
 * (console errors, failed requests, horizontal overflow) into `report.json`.
 */
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};

type Finding = { screen: string; kind: 'console' | 'pageerror' | 'request' | 'overflow'; detail: string };

const SCREENS: { name: string; url: string }[] = [
    { name: 'home', url: TENANT_HOME_PAGE_ROUTE },
    ...Object.values(LEAD_GENERATION_SUB_MODULES)
        .filter((subModule) => !HIDDEN_SUB_MODULES.has(subModule))
        .map((subModule) => ({
            name: subModule.toLowerCase().replace(/_/g, '-'),
            url: SubModuleUrls[subModule],
        })),
    { name: 'account-settings', url: ACCOUNT_SETTINGS_ROUTE },
];

test.use({ storageState: USER_STORAGE_STATE });

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test('lead generation walkthrough', async ({ page, db }) => {
            test.setTimeout(10 * 60_000);
            await db.resetUser(E2E_USER);

            const outDir = path.join(E2E_ARTIFACTS_DIR, 'walkthrough', viewportName);
            await mkdir(outDir, { recursive: true });

            const findings: Finding[] = [];
            let screen = 'start';
            let shot = 0;
            page.on('console', (msg) => {
                if (msg.type() === 'error') findings.push({ screen, kind: 'console', detail: msg.text().slice(0, 500) });
            });
            page.on('pageerror', (error) => findings.push({ screen, kind: 'pageerror', detail: error.message }));
            page.on('response', (res) => {
                if (res.status() >= 400) findings.push({ screen, kind: 'request', detail: `${res.status()} ${res.url()}` });
            });

            const capture = async (name: string) => {
                screen = name;
                await settle(page);
                const overflow = await page.evaluate(
                    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
                if (overflow > 1) findings.push({ screen, kind: 'overflow', detail: `${overflow}px wider than the viewport` });
                shot += 1;
                await page.screenshot({
                    path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`),
                    fullPage: true,
                });
            };

            for (const { name, url } of SCREENS) {
                await test.step(name, async () => {
                    screen = name;
                    await page.goto(url);
                    await capture(name);
                });
            }

            await test.step('form states', async () => {
                screen = 'form-validation';
                await openLeadGenForm(page, GOOGLE_ADVANCED_SEARCH_FORM);
                await expectRunBlockedByValidation(page);
                await capture('form-validation');

                screen = 'form-save-dialog';
                await page.reload();
                await openLeadGenForm(page, GOOGLE_ADVANCED_SEARCH_FORM);
                await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
                await page.getByRole('button', { name: 'Save and Run', exact: true }).click();
                await expect(page.getByRole('dialog')).toBeVisible();
                await capture('form-save-dialog');
                await page.keyboard.press('Escape');

                await mockScrape(page, 'hang');
                await saveAndRun(page, 'Loading state');
                await expect(page.getByRole('button', { name: 'Abort request' })).toBeVisible();
                await capture('form-running');
                await page.getByRole('button', { name: 'Abort request' }).click();
                await page.unrouteAll({ behavior: 'ignoreErrors' });

                await mockScrape(page, { body: { success: true, data: searchLeads(12) } });
                await page.getByRole('button', { name: 'Run "Loading state"' }).click();
                await expect(page.getByText('Your leads are ready.')).toBeVisible();
                await capture('form-success-toast');
            });

            await test.step('saved leads', async () => {
                screen = 'leads-with-list';
                await page.goto(LEADS_URL);
                await expect(page.getByText('12 leads', { exact: true })).toBeVisible();
                await capture('leads-with-list');

                screen = 'lead-list-detail';
                await page.getByText(/^Loading state · /).click();
                await page.waitForURL(new RegExp(`${LEADS_URL}/[a-f0-9]{24}$`));
                await expect(page.getByText('Plumber 1 of Pune').first()).toBeVisible();
                await capture('lead-list-detail');
            });

            await test.step('credits exhausted', async () => {
                screen = 'credits-exhausted';
                await db.resetUser(E2E_USER, { credits: 2 });
                await page.unrouteAll({ behavior: 'ignoreErrors' });
                await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
                await openLeadGenForm(page, GOOGLE_ADVANCED_SEARCH_FORM);
                await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
                await saveAndRun(page, 'Last credits');
                await expect(page.getByRole('dialog', { name: 'Credits exhausted' })).toBeVisible();
                await capture('credits-exhausted');
            });

            await writeFile(path.join(outDir, 'report.json'), JSON.stringify(findings, null, 4));
            await db.resetUser(E2E_USER);
        });
    });
}

/** Lets data-driven UI (credits badge, lists) finish loading before the screenshot. */
async function settle(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(500);
}
