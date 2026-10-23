import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { VoiceAgentCallType, type VoiceAgentDoc, type VoiceAgentWebhookTool } from '@aixellabs/backend/db/types';
import { defaultVoiceBookingTool } from '@/helpers/voice-agent-defaults';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { openVoiceAgent } from '../support/voice-agents';

/**
 * The agent editor's prompt field: tool names marked in the text (warning style when the agent
 * lacks the tool) and the "/" menu that inserts a tool name.
 */
test.use({ storageState: USER_STORAGE_STATE, timezoneId: 'Asia/Kolkata' });

const SCREENSHOTS = path.join(E2E_ARTIFACTS_DIR, 'prompt-editor');
const BOOKING_OFF = 'This tool is off — turn it on in Tools';

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
});

function webhookTool(fields: Partial<VoiceAgentWebhookTool> = {}): VoiceAgentWebhookTool {
    return {
        id: 'a1b2c3d4e5f60718',
        name: 'check_order',
        description: 'When the caller asks where their order is.',
        parameters: [],
        url: 'https://example.com/hooks/order',
        secretSealed: null,
        enabled: true,
        ...fields,
    };
}

async function agentWith(db: E2eDb, prompt: string, tools: VoiceAgentDoc['tools']): Promise<string> {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Front desk',
        callType: VoiceAgentCallType.INBOUND,
        prompt,
    });
    await db.setVoiceAgentTools(agentId, tools);
    return agentId;
}

const bookingOn = () => ({ ...defaultVoiceBookingTool('Asia/Kolkata'), enabled: true });

const prompt = (page: Page) => page.locator('#agent-prompt');
const menu = (page: Page) => page.getByRole('listbox', { name: 'Insert a tool' });
const mark = (page: Page, name: string) => page.getByTestId('prompt-mirror').locator(`mark[data-tool="${name}"]`);

/** Puts the caret at the end of the prompt and types `text` key by key. */
async function typeAtEnd(page: Page, text: string): Promise<void> {
    await prompt(page).focus();
    await prompt(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.type(text);
}

test('marks tools the agent has, and warns about ones it does not', async ({ page, db }) => {
    const agentId = await agentWith(
        db,
        'Use check_order for orders. Offer times with check_availability, then book_appointment.\n' +
            'Ask lookup_stock about stock. Docs: https://example.com/lookup_stock, write to ops_team@example.com. Hi {caller_name}.',
        { booking: null, webhooks: [webhookTool(), webhookTool({ id: 'b2', name: 'refund_order', enabled: false })] },
    );
    await openVoiceAgent(page, agentId);

    await expect(mark(page, 'check_order')).toHaveCount(1);
    await expect(mark(page, 'check_order')).not.toHaveAttribute('data-problem');
    await expect(mark(page, 'check_availability')).toHaveAttribute('data-problem', BOOKING_OFF);
    await expect(mark(page, 'book_appointment')).toHaveAttribute('data-problem', BOOKING_OFF);
    // A word in tool-name form the agent has no tool for (renamed or deleted): only the one in prose.
    await expect(mark(page, 'lookup_stock')).toHaveCount(1);
    await expect(mark(page, 'lookup_stock')).toHaveAttribute(
        'data-problem',
        'No tool by this name — add it in Tools, or fix the name',
    );
    await expect(mark(page, 'ops_team')).toHaveCount(0);
    await expect(mark(page, 'caller_name')).toHaveCount(0);

    const problems = page.getByTestId('prompt-tool-problem');
    await expect(problems).toHaveCount(2);
    await expect(problems.nth(0)).toContainText(`check_availability, book_appointment: ${BOOKING_OFF}.`);
    await expect(prompt(page)).toHaveAttribute('aria-describedby', 'agent-prompt-help agent-prompt-problems');

    // Hovering a warning explains it (the prompt sits below the agent's stack: scroll to it first).
    await prompt(page).scrollIntoViewIfNeeded();
    const box = await mark(page, 'book_appointment').boundingBox();
    if (!box) throw new Error('book_appointment is not on screen');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('tooltip')).toHaveText(BOOKING_OFF);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // "Go to Tools" lands on check_availability's switch; turning it on clears both warnings before any save.
    await problems.nth(0).getByRole('button', { name: 'Go to Tools' }).click();
    const toggle = page.getByTestId('voice-agent-tools').getByRole('switch', { name: 'Use check_availability' });
    await expect(toggle).toBeFocused();
    await expect(toggle).toBeInViewport();
    await toggle.click();
    await expect(mark(page, 'book_appointment')).not.toHaveAttribute('data-problem');
    await expect(problems).toHaveCount(1);

    // A custom tool that is switched off is a warning too.
    await typeAtEnd(page, ' Refunds go through refund_order.');
    await expect(mark(page, 'refund_order')).toHaveAttribute('data-problem', 'This tool is off — turn it on in Tools');
});

test('the marks stay on the text while scrolling and resizing', async ({ page, db }) => {
    const lines = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: book_appointment when asked.`).join('\n');
    const agentId = await agentWith(db, lines, { booking: bookingOn(), webhooks: [] });
    await openVoiceAgent(page, agentId);

    const geometry = () =>
        page.evaluate(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>('#agent-prompt')!;
            const mirror = document.querySelector<HTMLElement>('[data-testid="prompt-mirror"]')!;
            return {
                widths: [textarea.clientWidth, mirror.clientWidth],
                heights: [textarea.clientHeight, mirror.clientHeight],
                scroll: [textarea.scrollTop, mirror.scrollTop],
                scrollHeights: [textarea.scrollHeight, mirror.scrollHeight],
            };
        });
    let g = await geometry();
    expect(g.widths[0]).toBe(g.widths[1]);
    expect(g.scrollHeights[0]).toBe(g.scrollHeights[1]);

    await prompt(page).evaluate((el) => el.scrollTo({ top: 600 }));
    await expect.poll(async () => (await geometry()).scroll).toEqual([600, 600]);

    // The resize handle: the mirror follows the textarea's new size.
    await prompt(page).evaluate((el) => (el.style.height = '200px'));
    await expect.poll(async () => (await geometry()).heights[1]).toBe((await geometry()).heights[0]);
    g = await geometry();
    expect(g.widths[0]).toBe(g.widths[1]);
});

test('"/" menu: filter, keyboard, Tab, undo and Escape', async ({ page, db }) => {
    const agentId = await agentWith(db, 'You are Maya.', { booking: bookingOn(), webhooks: [webhookTool()] });
    await openVoiceAgent(page, agentId);

    await typeAtEnd(page, ' /');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('option')).toHaveText([
        /^check_availability/,
        /^book_appointment/,
        /^check_order\s*When the caller asks where their order is\./,
    ]);
    await expect(prompt(page)).toHaveAttribute('aria-controls', 'agent-prompt-tools');
    await expect(prompt(page)).toHaveAttribute('aria-activedescendant', 'agent-prompt-tool-0');

    await page.keyboard.type('check');
    const options = menu(page).getByRole('option');
    await expect(options).toHaveText([/^check_availability/, /^check_order/]);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(prompt(page)).toHaveAttribute('aria-activedescendant', 'agent-prompt-tool-1');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(menu(page)).toHaveCount(0);
    await expect(prompt(page)).toHaveValue('You are Maya. check_order ');
    await expect(mark(page, 'check_order')).toHaveCount(1);

    // The browser's own undo puts the typed "/check" back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(prompt(page)).toHaveValue('You are Maya. /check');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(prompt(page)).toHaveValue('You are Maya. check_order ');

    // Tab inserts too; no name matches -> the one entry goes to Tools.
    await page.keyboard.type('then /bo');
    await page.keyboard.press('Tab');
    await expect(prompt(page)).toHaveValue('You are Maya. check_order then book_appointment ');
    await page.keyboard.type('/zzz');
    await expect(menu(page).getByRole('option')).toHaveText([/Set up tools\s*No tool matches “zzz”/]);

    // Escape closes it and it stays closed while typing on; a new "/" opens it again.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await page.keyboard.type('z');
    await expect(menu(page)).toHaveCount(0);
    await expect(prompt(page)).not.toHaveAttribute('aria-controls');
    await page.keyboard.type(' /');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
});

test('"/" menu: mouse insertion, no menu mid-word or in a link', async ({ page, db }) => {
    const agentId = await agentWith(db, 'Hello.', { booking: bookingOn(), webhooks: [] });
    await openVoiceAgent(page, agentId);

    await typeAtEnd(page, ' Then /');
    await menu(page)
        .getByRole('option', { name: /^book_appointment/ })
        .click();
    await expect(prompt(page)).toHaveValue('Hello. Then book_appointment ');
    await expect(prompt(page)).toBeFocused();

    for (const text of ['and/or', 'see https://example.com/', 'path a/b/']) {
        await page.keyboard.type(text);
        await expect(menu(page)).toHaveCount(0);
        await page.keyboard.type(' ');
    }

    // Moving the caret off the "/" word closes it; moving back opens it; leaving the field closes it.
    await page.keyboard.type('/che');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Home');
    await expect(menu(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+End');
    await expect(menu(page)).toBeVisible();
    await page.locator('#agent-name').click();
    await expect(menu(page)).toHaveCount(0);
});

test('an agent with no tools: "/" offers the Tools card', async ({ page, db }) => {
    const agentId = await agentWith(db, 'Hello.', { booking: null, webhooks: [] });
    await openVoiceAgent(page, agentId);

    await typeAtEnd(page, ' /');
    await expect(menu(page).getByRole('option')).toHaveText([/Set up tools\s*This agent has no tools yet/]);
    await page.keyboard.press('Enter');
    await expect(menu(page)).toHaveCount(0);
    // The "/" goes away again.
    await expect(prompt(page)).toHaveValue('Hello. ');
    await expect(page.getByTestId('voice-agent-tools')).toBeInViewport();
});

test('saving still works, and the marks come back after a reload', async ({ page, db }) => {
    const agentId = await agentWith(db, 'You are Maya.', { booking: bookingOn(), webhooks: [] });
    await openVoiceAgent(page, agentId);

    await typeAtEnd(page, ' Use /check');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await expect(prompt(page)).toHaveValue('You are Maya. Use check_availability ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    // The server trims the prompt.
    expect((await db.getVoiceAgentDoc(agentId)).prompt).toBe('You are Maya. Use check_availability');

    await page.reload();
    await expect(prompt(page)).toHaveValue('You are Maya. Use check_availability');
    await expect(mark(page, 'check_availability')).toHaveCount(1);
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);

    // Discard puts the saved prompt back, marks included.
    await typeAtEnd(page, ' and book_appointment');
    await expect(mark(page, 'book_appointment')).toHaveCount(1);
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(prompt(page)).toHaveValue('You are Maya. Use check_availability');
    await expect(mark(page, 'book_appointment')).toHaveCount(0);
});

const SHOWCASE_PROMPT =
    'You are Maya, the front desk at Sunrise Dental.\n\n' +
    'When a caller wants an appointment, use check_availability for the day first, offer only the times it returned, ' +
    'and book_appointment once they pick one. For order questions use check_order. For refunds use refund_order.\n\n' +
    'Keep answers short. ';

for (const { name, viewport } of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'phone', viewport: { width: 390, height: 844 } },
]) {
    test.describe(name, () => {
        test.use({ viewport, hasTouch: name === 'phone' });

        for (const theme of ['light', 'dark'] as const) {
            test(`marks and the "/" menu fit (${theme})`, async ({ page, db }) => {
                mkdirSync(SCREENSHOTS, { recursive: true });
                await page.addInitScript((t) => window.localStorage.setItem('theme', t), theme);
                const agentId = await agentWith(db, SHOWCASE_PROMPT, {
                    booking: bookingOn(),
                    webhooks: [webhookTool(), webhookTool({ id: 'b2', name: 'refund_order', enabled: false })],
                });
                await openVoiceAgent(page, agentId);
                await expect(page.locator('html')).toHaveClass(new RegExp(theme));

                const field = prompt(page);
                await field.evaluate((el) => el.scrollIntoView({ block: 'center' }));
                await page.screenshot({ path: path.join(SCREENSHOTS, `${name}-${theme}-marks.png`) });

                await typeAtEnd(page, '/');
                await expect(menu(page)).toBeVisible();
                await expect(menu(page).getByRole('option')).toHaveCount(3);
                const menuBox = await menu(page).boundingBox();
                const fieldBox = await field.boundingBox();
                if (!menuBox || !fieldBox) throw new Error('menu or field not on screen');
                expect(menuBox.x).toBeGreaterThanOrEqual(fieldBox.x - 1);
                expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width + 1);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
                await menu(page).evaluate((el) => el.scrollIntoView({ block: 'end' }));
                await page.screenshot({ path: path.join(SCREENSHOTS, `${name}-${theme}-menu.png`) });

                if (name === 'phone') {
                    await menu(page)
                        .getByRole('option', { name: /^check_order/ })
                        .tap();
                    await expect(field).toHaveValue(`${SHOWCASE_PROMPT}check_order `);
                }
            });
        }
    });
}
