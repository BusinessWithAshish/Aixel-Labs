import type { Page } from '@playwright/test';
import { expect } from '../support/fixtures';
import { waitForHydration } from '../support/voice-agents';
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

/**
 * Tests that link or unlink a number to an agent wait for the agent editor's number picker (the
 * agent-card session builds it). Then: write `linkNumber` / `unlinkNumber` against it and set this
 * to null, and every one of them runs again unchanged.
 */
export const LINK_UI_PENDING: string | null =
    'Numbers are linked from the agent editor, whose number picker is not built yet';

/** Links the number to the agent from the agent's page; its type decides the number's job. */
export async function linkNumber(page: Page, agentId: string, phoneNumber: string): Promise<void> {
    throw new Error(`linkNumber(${agentId}, ${phoneNumber}): ${LINK_UI_PENDING}`);
}

/** Unlinks the number from the agent, from the agent's page. */
export async function unlinkNumber(page: Page, agentId: string, phoneNumber: string): Promise<void> {
    throw new Error(`unlinkNumber(${agentId}, ${phoneNumber}): ${LINK_UI_PENDING}`);
}
