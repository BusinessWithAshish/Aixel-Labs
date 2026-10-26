import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { VOICE_AGENTS_URL, voiceAgentUrl, waitForHydration } from '../support/voice-agents';

test.use({ storageState: USER_STORAGE_STATE });

test('a link inside a page shows the loading bar at once and drops it when the next page is in', async ({ page, db }) => {
    await db.resetVoiceAgents(E2E_USER);
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Slow page' });
    const agentUrl = voiceAgentUrl(agentId);

    await page.goto(VOICE_AGENTS_URL);
    const link = page.locator(`main a[href="${agentUrl}"]`).first();
    await waitForHydration(page, `main a[href="${agentUrl}"]`);
    // The next page takes a while to come from the server.
    await page.route(`**${agentUrl}**`, async (route) => {
        if (route.request().headers()['rsc']) await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
    });

    await link.click();
    const bar = page.getByRole('progressbar', { name: 'Loading the page' });
    await expect(bar).toBeVisible({ timeout: 1000 });
    await expect(page).toHaveURL(new RegExp(`${agentUrl}$`));
    await expect(bar).toBeHidden();
});
