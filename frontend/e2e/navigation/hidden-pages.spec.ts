import type { BrowserContext, Page } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { Modules, type SubModule, VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls, TENANT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { subModuleChildren } from '@/config/sidebar.config';
import { FeatureFlagKey, SUB_MODULE_FLAG_KEY } from '@/flags';
import { getDefaultModuleAccess, getSubModulesForModule } from '@/helpers/module-access-helpers';
import { sidebarUrls } from '@/helpers/sidebar-config-helpers';
import { enumToTitleCase } from '@/helpers/string-helpers';
import { expect, test } from '../support/fixtures';
import { ADMIN_STORAGE_STATE, E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_ADMIN, E2E_USER } from '../support/users';

/** Every flag is off by default, so every flagged page is hidden and the rest are shown. */
const ALL_SUB_MODULES = Object.values(getDefaultModuleAccess()).flat() as SubModule[];
const isFlagged = (subModule: SubModule) => subModule in SUB_MODULE_FLAG_KEY;
// A sub-module that is a folder (WhatsApp) shows its pages instead of one link.
const urlsOf = (subModules: SubModule[]) =>
    [
        ...new Set(
            subModules.flatMap((subModule) => {
                const children = subModuleChildren[subModule];
                return children ? sidebarUrls(children) : [SubModuleUrls[subModule]];
            }),
        ),
    ].sort();

const HIDDEN_URLS = urlsOf(ALL_SUB_MODULES.filter(isFlagged));
const SHOWN_URLS = urlsOf(ALL_SUB_MODULES.filter((subModule) => !isFlagged(subModule)));
const HIDDEN_MODULES = Object.values(Modules).filter((module) => getSubModulesForModule(module).every(isFlagged));
const WEB_DIALER_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.WEB_DIALER];

/** Opens every module group and every folder inside them, and returns the sidebar's page links. */
async function sidebarLinks(page: Page): Promise<string[]> {
    await page.goto(TENANT_HOME_PAGE_ROUTE);
    const sidebar = page.locator('[data-sidebar="sidebar"]').first();
    await waitForHydration(page, '[data-sidebar="menu-button"]');
    const closed = sidebar.locator(
        '[data-sidebar="menu-item"][data-state="closed"] > [data-sidebar="menu-button"], [data-sidebar="menu-sub-item"][data-state="closed"] > [data-sidebar="menu-sub-button"]',
    );
    while ((await closed.count()) > 0) {
        await closed.first().click();
    }
    const hrefs = await sidebar.locator('[data-sidebar="menu-sub"] a').evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? ''),
    );
    return [...new Set(hrefs)].sort();
}

/** Opens `url` and checks whether the app answered with its 404 page. */
async function expectNotFound(page: Page, url: string, notFound: boolean): Promise<void> {
    await page.goto(url);
    await expect(page.locator('#header').first()).toBeVisible();
    const heading = page.getByRole('heading', { name: '404 - Page Not Found' });
    await (notFound ? expect(heading.first()).toBeVisible() : expect(heading).toHaveCount(0));
}

async function enableFlag(context: BrowserContext, key: FeatureFlagKey): Promise<void> {
    const value = await encryptOverrides({ [key]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
}

for (const { name, user, storageState } of [
    { name: 'user with every module', user: E2E_USER, storageState: USER_STORAGE_STATE },
    { name: 'admin', user: E2E_ADMIN, storageState: ADMIN_STORAGE_STATE },
]) {
    test.describe(name, () => {
        test.use({ storageState });
        test.beforeEach(async ({ db }) => db.resetUser(user));

        test('sidebar lists working pages only', async ({ page }) => {
            expect(await sidebarLinks(page)).toEqual(SHOWN_URLS);
            const sidebar = page.locator('[data-sidebar="sidebar"]').first();
            for (const module of HIDDEN_MODULES) {
                await expect(sidebar.getByRole('button', { name: enumToTitleCase(module), exact: true })).toHaveCount(0);
            }
            await expect(sidebar.getByRole('button', { name: 'Voice Agent', exact: true })).toBeVisible();
        });

        test('hidden pages 404 by URL', async ({ page }) => {
            test.slow(); // one navigation per page, each compiled on first hit
            for (const url of HIDDEN_URLS) {
                await test.step(url, () => expectNotFound(page, url, true));
            }
        });

        test('working pages still open', async ({ page }) => {
            test.slow();
            for (const url of SHOWN_URLS) {
                await test.step(url, () => expectNotFound(page, url, false));
            }
        });
    });
}

test.describe('flag override', () => {
    test.use({ storageState: USER_STORAGE_STATE });
    test.beforeEach(async ({ db }) => db.resetUser(E2E_USER));

    test('turning a page flag on shows the page in the sidebar and by URL', async ({ page, context }) => {
        await enableFlag(context, FeatureFlagKey.VOICE_WEB_DIALER);

        expect(await sidebarLinks(page)).toEqual([...SHOWN_URLS, WEB_DIALER_URL].sort());
        await expectNotFound(page, WEB_DIALER_URL, false);
        await expect(page.getByText('Web dialer').first()).toBeVisible();
    });
});
