import type { Locator, Page } from '@playwright/test';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import {
    setupGuideFor,
    TELNYX_GUIDE_STEP,
    TWILIO_GUIDE_STEP,
} from '@/app/(protected)/voice-agent/phone-numbers/_utils/setup-guides';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { FAKE_TELNYX_KEY, PHONE_NUMBERS_URL, sealForE2e } from './fake-telephony';

const GUIDE = setupGuideFor(VoiceProvider.TELNYX)!;
const STEP_COUNT = GUIDE.steps.length;

async function openPhoneNumbers(page: Page): Promise<void> {
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');
}

function banner(page: Page): Locator {
    return page.getByRole('region', { name: 'Setup guide' });
}

function guideDialog(page: Page): Locator {
    return page.getByRole('dialog', { name: GUIDE.title });
}

async function expectStep(page: Page, index: number): Promise<void> {
    const dialog = guideDialog(page);
    await expect(dialog.getByTestId('setup-guide-counter')).toHaveText(`Step ${index + 1} of ${STEP_COUNT}`);
    await expect(dialog.getByRole('heading', { name: GUIDE.steps[index].title })).toBeVisible();
}

/** The step's screenshot decoded (a broken path leaves naturalWidth at 0). */
async function expectImageLoaded(page: Page, index: number): Promise<void> {
    const image = guideDialog(page).getByRole('img', { name: GUIDE.steps[index].image!.alt });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
}

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

test('a user with no numbers sees the banner and can walk through every step', async ({ page }) => {
    await openPhoneNumbers(page);
    await expect(banner(page)).toContainText(`in ${STEP_COUNT} steps`);

    await banner(page).getByRole('button', { name: 'See the guide' }).click();
    await expect(guideDialog(page)).toBeVisible();
    await expectStep(page, 0);
    await expect(guideDialog(page).getByRole('button', { name: 'Previous' })).toBeDisabled();

    for (let i = 0; i < STEP_COUNT; i++) {
        await expectStep(page, i);
        await expectImageLoaded(page, i);
        if (i < STEP_COUNT - 1) await guideDialog(page).getByRole('button', { name: 'Next' }).click();
    }

    await guideDialog(page).getByRole('button', { name: 'Previous' }).click();
    await expectStep(page, STEP_COUNT - 2);
    await guideDialog(page).getByRole('button', { name: 'Next' }).click();
    await guideDialog(page).getByRole('button', { name: 'Done' }).click();
    await expect(guideDialog(page)).toBeHidden();
});

test('arrow keys move between steps and the dots jump to one', async ({ page }) => {
    await openPhoneNumbers(page);
    await page.getByRole('button', { name: 'Setup guide', exact: true }).click();
    await expectStep(page, 0);

    await page.keyboard.press('ArrowRight');
    await expectStep(page, 1);
    await page.keyboard.press('ArrowRight');
    await expectStep(page, 2);
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, 1);
    // Already at the first step: stays there.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expectStep(page, 0);

    const last = STEP_COUNT - 1;
    await guideDialog(page)
        .getByRole('button', { name: `Go to step ${last + 1}: ${GUIDE.steps[last].title}` })
        .click();
    await expectStep(page, last);

    // Zoom in on the screenshot and back.
    await guideDialog(page).getByRole('button', { name: 'Zoom in on the screenshot' }).click();
    await guideDialog(page).getByRole('button', { name: 'Fit the screenshot' }).click();
    await expect(guideDialog(page).getByRole('button', { name: 'Zoom in on the screenshot' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(guideDialog(page)).toBeHidden();
    // Reopening starts from the first step again.
    await page.getByRole('button', { name: 'Setup guide', exact: true }).click();
    await expectStep(page, 0);
});

test('dismissing the banner sticks after a reload, and the guide stays one click away', async ({ page }) => {
    await openPhoneNumbers(page);
    await banner(page).getByRole('button', { name: 'Dismiss the setup guide tip' }).click();
    await expect(banner(page)).toHaveCount(0);

    await page.reload();
    await waitForHydration(page, '#header');
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Setup guide', exact: true }).click();
    await expectStep(page, 0);
});

test('the banner is not shown once the user has a number', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+13473703925',
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
    });
    await openPhoneNumbers(page);
    await expect(page.getByTestId('voice-number-row')).toHaveCount(1);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Setup guide', exact: true })).toBeVisible();
});

test('"How do I get this?" in the Connect dialog opens the guide at the API key step', async ({ page }) => {
    await openPhoneNumbers(page);
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    const connect = page.getByRole('dialog', { name: 'Connect a number' });
    await connect.getByLabel('Telnyx API key').fill('KEY0-typed-before-opening-the-guide');

    await connect.getByRole('button', { name: 'How do I get this?' }).click();
    const apiKeyStep = GUIDE.steps.findIndex((step) => step.id === TELNYX_GUIDE_STEP.API_KEY);
    await expectStep(page, apiKeyStep);
    await expectImageLoaded(page, apiKeyStep);

    // Closing the guide returns to the Connect dialog with what was typed.
    await page.keyboard.press('Escape');
    await expect(guideDialog(page)).toBeHidden();
    await expect(connect).toBeVisible();
    await expect(connect.getByLabel('Telnyx API key')).toHaveValue('KEY0-typed-before-opening-the-guide');

    // VoiceLink has no guide yet, so no link.
    await connect.getByRole('radio', { name: 'VoiceLink' }).click();
    await expect(connect.getByRole('button', { name: 'How do I get this?' })).toHaveCount(0);
});

test('the Twilio guide is a text walk-through, reachable from the banner and from the Twilio connect form', async ({
    page,
}) => {
    const twilioGuide = setupGuideFor(VoiceProvider.TWILIO)!;
    const dialog = page.getByRole('dialog', { name: twilioGuide.title });
    await openPhoneNumbers(page);
    await banner(page).getByRole('button', { name: 'See the Twilio guide' }).click();
    for (let i = 0; i < twilioGuide.steps.length; i++) {
        await expect(dialog.getByTestId('setup-guide-counter')).toHaveText(`Step ${i + 1} of ${twilioGuide.steps.length}`);
        await expect(dialog.getByRole('heading', { name: twilioGuide.steps[i].title })).toBeVisible();
        // No screenshots yet (and never Twilio's logo or brand art): text and a link to the Console page.
        await expect(dialog.getByTestId('setup-guide-image-frame')).toHaveCount(0);
        if (i < twilioGuide.steps.length - 1) await dialog.getByRole('button', { name: 'Next' }).click();
    }
    await dialog.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    const connect = page.getByRole('dialog', { name: 'Connect a number' });
    await connect.getByRole('radio', { name: 'Twilio' }).click();
    await connect.getByRole('button', { name: 'How do I get this?' }).click();
    const apiKeyStep = twilioGuide.steps.findIndex((step) => step.id === TWILIO_GUIDE_STEP.API_KEY);
    await expect(dialog.getByRole('heading', { name: twilioGuide.steps[apiKeyStep].title })).toBeVisible();
    await expect(dialog).toContainText('Restricted');
    await page.keyboard.press('Escape');
    await expect(connect.getByLabel('Account SID')).toBeVisible();
});
