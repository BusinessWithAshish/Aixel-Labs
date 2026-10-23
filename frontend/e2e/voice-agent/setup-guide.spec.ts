import type { Locator, Page } from '@playwright/test';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import { setupGuideFor, type SetupGuide } from '@/app/(protected)/voice-agent/phone-numbers/_utils/setup-guides';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { openConnect, openPhoneNumbers } from './phone-numbers-page';

const PROVIDERS = [VoiceProvider.TELNYX, VoiceProvider.TWILIO, VoiceProvider.VOICELINK] as const;
const label = (provider: VoiceProvider) => numberProviderInfo(provider).label as 'Telnyx' | 'Twilio' | 'VoiceLink';

function guideDialog(page: Page, guide: SetupGuide): Locator {
    return page.getByRole('dialog', { name: guide.title });
}

/** The provider's guide, from its connect dialog (the one way in); returns the connect dialog. */
async function openGuide(page: Page, provider: VoiceProvider): Promise<Locator> {
    const connect = await openConnect(page, label(provider));
    await connect.getByRole('button', { name: `${label(provider)} setup guide` }).click();
    return connect;
}

async function expectStep(page: Page, guide: SetupGuide, index: number): Promise<void> {
    const dialog = guideDialog(page, guide);
    await expect(dialog.getByTestId('setup-guide-counter')).toHaveText(`Step ${index + 1} of ${guide.steps.length}`);
    await expect(dialog.getByRole('heading', { name: guide.steps[index].title })).toBeVisible();
}

/** The step's picture decoded (a broken path leaves naturalWidth at 0). */
async function expectImageLoaded(page: Page, guide: SetupGuide, index: number): Promise<void> {
    const image = guideDialog(page, guide).getByRole('img', { name: guide.steps[index].image!.alt });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
}

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

for (const provider of PROVIDERS) {
    const guide = setupGuideFor(provider);

    test(`the ${label(provider)} guide opens from its connect dialog, alone, with a picture on every step`, async ({
        page,
    }) => {
        await openPhoneNumbers(page);
        await openGuide(page, provider);
        const dialog = guideDialog(page, guide);
        await expect(dialog).toBeVisible();
        // Only this provider's guide: no switch to another one.
        await expect(dialog.getByRole('radio')).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: 'Previous' })).toBeDisabled();

        for (let i = 0; i < guide.steps.length; i++) {
            await expectStep(page, guide, i);
            await expectImageLoaded(page, guide, i);
            if (i < guide.steps.length - 1) await dialog.getByRole('button', { name: 'Next' }).click();
        }

        await dialog.getByRole('button', { name: 'Previous' }).click();
        await expectStep(page, guide, guide.steps.length - 2);
        await dialog.getByRole('button', { name: 'Next' }).click();
        await dialog.getByRole('button', { name: 'Done' }).click();
        await expect(dialog).toBeHidden();
    });
}

test('arrow keys move between steps, the dots jump to one, and reopening starts over', async ({ page }) => {
    const guide = setupGuideFor(VoiceProvider.TELNYX);
    await openPhoneNumbers(page);
    await openGuide(page, VoiceProvider.TELNYX);
    await expectStep(page, guide, 0);

    await page.keyboard.press('ArrowRight');
    await expectStep(page, guide, 1);
    await page.keyboard.press('ArrowRight');
    await expectStep(page, guide, 2);
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, guide, 1);
    // Already at the first step: stays there.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, guide, 0);

    const last = guide.steps.length - 1;
    const dialog = guideDialog(page, guide);
    await dialog.getByRole('button', { name: `Go to step ${last + 1}: ${guide.steps[last].title}` }).click();
    await expectStep(page, guide, last);

    // Zoom in on the picture and back.
    await dialog.getByRole('button', { name: 'Zoom in on the picture' }).click();
    await dialog.getByRole('button', { name: 'Fit the picture' }).click();
    await expect(dialog.getByRole('button', { name: 'Zoom in on the picture' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page
        .getByRole('dialog', { name: 'Connect a Telnyx number' })
        .getByRole('button', { name: 'Telnyx setup guide' })
        .click();
    await expectStep(page, guide, 0);
});

const KEY_FIELDS = [
    { provider: VoiceProvider.TELNYX, field: 'Telnyx API key' },
    { provider: VoiceProvider.TWILIO, field: 'API key SID' },
    { provider: VoiceProvider.VOICELINK, field: 'VoiceLink API token' },
];

for (const { provider, field } of KEY_FIELDS) {
    test(`the ${label(provider)} connect dialog's setup guide link keeps what was typed`, async ({ page }) => {
        const guide = setupGuideFor(provider);
        await openPhoneNumbers(page);
        const connect = await openConnect(page, label(provider));
        await connect.getByLabel(field).fill('typed-before-opening-the-guide');
        await expect(connect.getByRole('button', { name: 'How do I get this?' })).toHaveCount(0);

        await connect.getByRole('button', { name: `${label(provider)} setup guide` }).click();
        await expectStep(page, guide, 0);
        await expectImageLoaded(page, guide, 0);

        // Closing the guide returns to the connect dialog with what was typed.
        await page.keyboard.press('Escape');
        await expect(guideDialog(page, guide)).toBeHidden();
        await expect(connect).toBeVisible();
        await expect(connect.getByLabel(field)).toHaveValue('typed-before-opening-the-guide');
    });
}
