import type { BrowserContext, Page } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { formatMoney } from '@/helpers/voice-call-cost';
import { webCallUsdPerMinute } from '@/app/(protected)/voice-agent/web-dialer/_utils/web-dialer';
import { expect, test } from '../support/fixtures';
import { E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { sealForE2e } from './fake-telephony';

const WEB_DIALER_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.WEB_DIALER];
const NUMBER_INPUT = 'input[aria-label="Number to call"]';

test.use({ storageState: USER_STORAGE_STATE, locale: 'en-US' });

test.beforeEach(async ({ db, context }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    const value = await encryptOverrides({ [FeatureFlagKey.VOICE_WEB_DIALER]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
});

/** Server-action posts the page makes (the browser's sign-in is one). */
function countActions(page: Page): () => number {
    let count = 0;
    page.on('request', (req) => {
        if (req.method() === 'POST' && req.headers()['next-action']) count += 1;
    });
    return () => count;
}

async function openDialer(page: Page): Promise<void> {
    await page.goto(WEB_DIALER_URL);
    await waitForHydration(page, NUMBER_INPUT);
}

async function remember(context: BrowserContext, key: string, value: string): Promise<void> {
    await context.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [key, value]);
}

test('no number: points to Phone numbers', async ({ page }) => {
    await page.goto(WEB_DIALER_URL);
    await expect(page.getByText('No phone number yet')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connect a number' })).toHaveAttribute(
        'href',
        SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS],
    );
});

test('one number: no picker, the cost before calling, sign-in only once a number is dialled', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+14155550123',
        providerNumberId: 'pn-1',
        apiKeySealed: sealForE2e('KEY'),
    });
    const actions = countActions(page);
    await openDialer(page);

    const from = page.getByTestId('web-dialer-from');
    await expect(from).toContainText('+1 415 555 0123');
    await expect(from).toContainText('Telnyx');
    await expect(from.getByTestId(`number-provider-logo-${VoiceProvider.TELNYX}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Attach more numbers' })).toHaveAttribute(
        'href',
        SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS],
    );
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    const beforeDialling = actions();

    await page.locator(NUMBER_INPUT).fill('+12025550188');
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+1 202 555 0188');
    const rate = formatMoney(webCallUsdPerMinute(VoiceProvider.TELNYX, '+12025550188')!);
    await expect(page.getByTestId('web-dialer-hint')).toHaveText(`United States · about ${rate} a minute`);
    await expect(page.getByRole('button', { name: 'Call', exact: true })).toBeEnabled();
    await expect.poll(actions).toBeGreaterThan(beforeDialling);
});

test('several numbers: a picker, VoiceLink shown off with why, the pick remembered', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.VOICELINK,
        phoneNumber: '+919484950416',
        providerNumberId: '501',
        apiKeySealed: sealForE2e('TOKEN'),
        voicelink: { clientId: null, botId: 701, routingId: 9001 },
    });
    const twilioId = await db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.TWILIO,
        phoneNumber: '+14155550102',
        providerNumberId: 'PN102',
        apiKeySealed: sealForE2e('SECRET'),
        twilio: { accountSid: 'AC1', apiKeySid: 'SK1' },
    });
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+14155550101',
        providerNumberId: 'pn-101',
        apiKeySealed: sealForE2e('KEY'),
    });
    await openDialer(page);

    const picker = page.getByRole('combobox', { name: 'Calling from' });
    await expect(picker).toContainText('+1 415 555 0101');
    await picker.click();
    const voicelink = page.getByRole('option', { name: /\+91 94849 50416/ });
    await expect(voicelink).toHaveAttribute('aria-disabled', 'true');
    await expect(voicelink).toContainText('VoiceLink numbers cannot call from the browser.');
    await expect(page.getByRole('option', { name: /\+1 415 555 0102/ }).getByTestId(`number-provider-logo-${VoiceProvider.TWILIO}`)).toBeVisible();
    await page.getByRole('option', { name: /\+1 415 555 0102/ }).click();

    // Twilio to India has its own rate.
    await page.locator(NUMBER_INPUT).fill('+919876543210');
    const rate = formatMoney(webCallUsdPerMinute(VoiceProvider.TWILIO, '+919876543210')!);
    await expect(page.getByTestId('web-dialer-hint')).toHaveText(`India · about ${rate} a minute`);

    await openDialer(page);
    await expect(page.getByRole('combobox', { name: 'Calling from' })).toContainText('+1 415 555 0102');
    expect(await page.evaluate(() => window.localStorage.getItem('web-dialer-number'))).toBe(twilioId);
});

test('pasted text is cleaned, a number without its country code is caught, recent numbers redial', async ({
    page,
    db,
    context,
}) => {
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+14155550123',
        providerNumberId: 'pn-1',
        apiKeySealed: sealForE2e('KEY'),
    });
    await remember(context, 'web-dialer-recent', JSON.stringify(['+447700900123']));
    await page.setViewportSize({ width: 390, height: 844 });
    await openDialer(page);

    await page.getByRole('tab', { name: 'Recents' }).click();
    await page.getByRole('button', { name: /\+44 77009 00123/ }).click();
    await expect(page.getByRole('tab', { name: 'Keypad' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+44 77009 00123');

    await page.locator(NUMBER_INPUT).fill('Call me on 98765 43210!');
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('98765 43210');
    await expect(page.getByTestId('web-dialer-hint')).toHaveText('Start with the country code, like +1 or +91');

    await page.getByRole('button', { name: 'Delete last digit' }).click();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('98765 4321');
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
});

test('the keypad: long-press 0 for +, typing anywhere on the page', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+14155550123',
        providerNumberId: 'pn-1',
        apiKeySealed: sealForE2e('KEY'),
    });
    await openDialer(page);
    await expect(page.getByText('Long-press 0 for +')).toBeVisible();

    const zero = page.getByRole('button', { name: '0', exact: true });
    const box = (await zero.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+');
    await page.mouse.up();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await zero.click();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+10');

    // Keys typed with nothing focused go to the number too.
    await page.locator(NUMBER_INPUT).blur();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('2025550188');
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+1 202 555 0188');
});

test('in a call: the in-call screen, mute, keypad tones, hang up', async ({ page, db, context }) => {
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: '+14155550123',
        providerNumberId: 'pn-1',
        apiKeySealed: sealForE2e('KEY'),
    });
    // The microphone prompt stays open until the test answers it, so no call is ever placed.
    await context.addInitScript(() => {
        const w = window as unknown as { answerMic: () => void };
        navigator.mediaDevices.getUserMedia = () =>
            new Promise((resolve) => (w.answerMic = () => resolve(new MediaStream())));
    });
    await openDialer(page);
    await page.locator(NUMBER_INPUT).fill('+12025550188');
    await page.getByRole('button', { name: 'Call', exact: true }).click();

    await expect(page.getByText('Allow the microphone…')).toBeVisible();
    await expect(page.getByText('+1 202 555 0188')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    const mute = page.getByRole('button', { name: 'Mute' });
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Keypad' }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.keyboard.press('#');
    await expect(page.getByText('Allow the microphone… · 5#')).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(mute).toBeVisible();

    await page.getByRole('button', { name: 'Hang up' }).click();
    await page.evaluate(() => (window as unknown as { answerMic: () => void }).answerMic());
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('+1 202 555 0188');
    await expect(page.getByTestId('web-dialer-warning')).toHaveCount(0);
});
