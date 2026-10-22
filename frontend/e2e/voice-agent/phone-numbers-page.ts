import type { Page } from '@playwright/test';
import { expect } from '../support/fixtures';
import { openVoiceAgent, waitForHydration } from '../support/voice-agents';
import { PHONE_NUMBERS_URL } from './fake-telephony';

/** The Phone numbers page, the same way in every telephony spec. */

export async function openPhoneNumbers(page: Page): Promise<void> {
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');
}

export function numberRow(page: Page, phoneNumber: string) {
    return page.getByTestId('voice-number-row').filter({ hasText: phoneNumber });
}

/** What the row says uses the number: "Answers calls with …", "Places calls with …" or "Not linked to an agent". */
export function numberUse(page: Page, phoneNumber: string) {
    return numberRow(page, phoneNumber).getByTestId('number-use').getByRole('paragraph').first();
}

/** Picks the provider in the Connect a number menu; returns its connect dialog. */
export async function openConnect(page: Page, provider: 'Telnyx' | 'Twilio' | 'VoiceLink') {
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    await page.getByRole('menuitem', { name: new RegExp(`^${provider}`) }).click();
    const dialog = page.getByRole('dialog', { name: `Connect a ${provider} number` });
    await expect(dialog).toBeVisible();
    return dialog;
}

/** The row's delete icon; returns the confirm dialog. */
export async function openRemove(page: Page, phoneNumber: string) {
    await numberRow(page, phoneNumber)
        .getByRole('button', { name: `Remove ${phoneNumber}` })
        .click();
    return page.getByRole('dialog');
}

/** Set while the agent editor had no number picker; the routing specs skip on a message here. */
export const LINK_UI_PENDING: string | null = null;

/**
 * Ticks or unticks the number in the agent editor's number picker and saves. Throws with the error
 * the page shows (it stays visible) when the provider or the app refuses.
 */
async function setLinked(page: Page, agentId: string, phoneNumber: string, linked: boolean): Promise<void> {
    await openVoiceAgent(page, agentId);
    await page.getByTestId('agent-numbers-change').click();
    const dialog = page.getByRole('dialog', { name: /^Numbers it (answers|calls from)$/ });
    await dialog.getByRole('checkbox', { name: new RegExp(phoneNumber.replace('+', '\\+')) }).setChecked(linked);
    await dialog.getByRole('button', { name: 'Save' }).click();
    const failed = page.locator('[data-sonner-toast][data-type="error"]');
    await Promise.race([dialog.waitFor({ state: 'hidden' }), failed.first().waitFor({ state: 'visible' })]);
    if (await failed.count()) throw new Error(await failed.first().innerText());
}

/** Links the number to the agent from the agent's page; its type decides the number's job. */
export function linkNumber(page: Page, agentId: string, phoneNumber: string): Promise<void> {
    return setLinked(page, agentId, phoneNumber, true);
}

/** Unlinks the number from the agent, from the agent's page. */
export function unlinkNumber(page: Page, agentId: string, phoneNumber: string): Promise<void> {
    return setLinked(page, agentId, phoneNumber, false);
}
