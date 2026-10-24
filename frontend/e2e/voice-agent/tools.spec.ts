import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { VoiceAgentCallType, type VoiceAgentWebhookTool } from '@aixellabs/backend/db/types';
import type { E2eDb } from '../support/db';
import { expect, LOCAL_FETCH, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { openVoiceAgent, openVoiceTool } from '../support/voice-agents';
import { sealForE2e } from './fake-telephony';

/**
 * The agent editor's Tools card: one list of tools (the built-in booking tools, then custom webhook tools), each
 * opened for its settings.
 * Test requests go to a throwaway HTTP server on 127.0.0.1 started by the spec.
 */
test.use({ storageState: USER_STORAGE_STATE, timezoneId: 'Asia/Kolkata' });

const SCREENSHOTS = path.join(E2E_ARTIFACTS_DIR, 'tools');
/** Made up for the tests; never a real credential. */
const FAKE_SECRET = 'e2e-signing-secret-not-real';

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
});

function inboundAgent(db: E2eDb, name = 'Front desk') {
    return db.insertVoiceAgent(E2E_USER, { name, callType: VoiceAgentCallType.INBOUND });
}

function webhookTool(fields: Partial<VoiceAgentWebhookTool> = {}): VoiceAgentWebhookTool {
    return {
        id: 'a1b2c3d4e5f60718',
        name: 'check_order',
        description: 'When the caller asks where their order is.',
        parameters: [
            { name: 'order_id', type: 'string', description: 'The order number', required: true },
            { name: 'quantity', type: 'number', description: '', required: false },
            { name: 'express', type: 'boolean', description: '', required: false },
        ],
        url: 'https://example.com/hooks/order',
        secretSealed: null,
        enabled: true,
        ...fields,
    };
}

function tools(page: Page) {
    return page.getByTestId('voice-agent-tools');
}

/** Picks an option of a Radix select by its trigger's id. */
async function pick(page: Page, triggerId: string, option: string | RegExp): Promise<void> {
    await page.locator(`#${triggerId}`).click();
    await page.getByRole('option', { name: option }).click();
}

// ---------------------------------------------------------------------------
// Appointment booking
// ---------------------------------------------------------------------------

test('booking: turn it on, set hours, save, and it is still there after a reload', async ({ page, db }) => {
    const agentId = await inboundAgent(db);
    await openVoiceAgent(page, agentId);

    const card = tools(page);
    await expect(card.getByText('Things the agent can do during a call.')).toBeVisible();
    // The list: the two built-in booking tools first, by the names the prompt uses, then "Add tool".
    const bookingTools = card.getByTestId('booking-tool-row');
    await expect(bookingTools).toHaveCount(2);
    await expect(bookingTools.nth(0)).toContainText('check_availability');
    await expect(bookingTools.nth(0)).toContainText('Built-in');
    await expect(bookingTools.nth(0).getByTestId('tool-where')).toHaveText('Reads: Built-in calendar');
    await expect(bookingTools.nth(1)).toContainText('book_appointment');
    await expect(bookingTools.nth(1).getByTestId('tool-where')).toHaveText('Writes: Built-in calendar, listed in Bookings');
    await expect(card.getByRole('button', { name: 'Add tool' })).toBeVisible();
    const check = card.getByRole('switch', { name: 'Use check_availability' });
    const book = card.getByRole('switch', { name: 'Use book_appointment' });
    await expect(check).toHaveAttribute('aria-checked', 'false');
    await expect(book).toHaveAttribute('aria-checked', 'false');
    // Settings show only when a tool is opened. Save sits at the top right of the card, waiting for a change.
    await expect(page.getByTestId('booking-settings')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Save tools' })).toBeDisabled();

    // book_appointment books only times check_availability found: turning it on turns both on.
    await book.click();
    await expect(check).toHaveAttribute('aria-checked', 'true');
    await expect(book).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByText('Unsaved changes')).toBeVisible();

    const row = await openVoiceTool(page, 'check_availability');
    // A new agent books into the built-in calendar from the browser's zone, weekdays 9 to 5, 30-minute
    // appointments, 30 days ahead.
    await expect(row.locator('#booking-destination')).toHaveText('Built-in calendar');
    await expect(page.locator('#booking-timezone')).toHaveText('Asia/Kolkata');
    await expect(page.locator('#booking-slot')).toHaveText('30 minutes');
    await expect(page.locator('#booking-days-ahead')).toHaveValue('30');
    await expect(page.getByRole('switch', { name: 'Open on Monday' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: 'Open on Sunday' })).toHaveAttribute('aria-checked', 'false');

    await page.locator('#booking-timezone').click();
    await page.getByPlaceholder('Search a city or region').fill('london');
    await page.getByRole('option', { name: /^Europe\/London/ }).click();
    await expect(page.locator('#booking-timezone')).toHaveText('Europe/London');

    await pick(page, 'booking-slot', '45 minutes');
    await page.locator('#booking-days-ahead').fill('14');
    await page.getByRole('switch', { name: 'Open on Monday' }).click();
    await page.getByLabel('Friday closes at').fill('16:00');
    await page.getByRole('switch', { name: 'Open on Saturday' }).click();
    await page.getByLabel('Saturday opens at').fill('10:00');
    await page.getByLabel('Saturday closes at').fill('14:00');
    await expect(page.getByTestId('booking-day-mon')).toContainText('Closed');

    // Opening book_appointment shows the same calendar (one tool open at a time) and where bookings are listed.
    const bookRow = await openVoiceTool(page, 'book_appointment');
    await expect(row.locator('#booking-destination')).toHaveCount(0);
    await expect(bookRow.locator('#booking-slot')).toHaveText('45 minutes');
    await expect(bookRow.getByRole('link', { name: 'Bookings' })).toHaveAttribute('href', '/voice-agent/bookings');

    await card.getByRole('button', { name: 'Save tools' }).click();
    await expect(page.getByText('Booking settings saved')).toBeVisible();
    await expect(card.getByText('Unsaved changes')).toHaveCount(0);

    const stored = await db.getVoiceAgentDoc(agentId);
    expect(stored.tools?.booking).toEqual({
        enabled: true,
        bookAppointment: true,
        timezone: 'Europe/London',
        slotMinutes: 45,
        maxDaysAhead: 14,
        hours: {
            tue: { open: '09:00', close: '17:00' },
            wed: { open: '09:00', close: '17:00' },
            thu: { open: '09:00', close: '17:00' },
            fri: { open: '09:00', close: '16:00' },
            sat: { open: '10:00', close: '14:00' },
        },
    });
    expect(stored.tools?.webhooks ?? []).toEqual([]);

    await openVoiceAgent(page, agentId);
    await expect(tools(page).getByRole('switch', { name: 'Use check_availability' })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await openVoiceTool(page, 'check_availability');
    await expect(page.locator('#booking-timezone')).toHaveText('Europe/London');
    await expect(page.locator('#booking-slot')).toHaveText('45 minutes');
    await expect(page.locator('#booking-days-ahead')).toHaveValue('14');
    await expect(page.getByTestId('booking-day-mon')).toContainText('Closed');
    await expect(page.getByLabel('Saturday opens at')).toHaveValue('10:00');
    await expect(page.getByLabel('Friday closes at')).toHaveValue('16:00');
    await expect(tools(page).getByText('Unsaved changes')).toHaveCount(0);

    // book_appointment off on its own: the agent gives free times and takes a message.
    await tools(page).getByRole('switch', { name: 'Use book_appointment' }).click();
    const off = await openVoiceTool(page, 'book_appointment');
    await expect(off).toContainText('takes a message instead of booking');
    await page.getByRole('button', { name: 'Save tools' }).click();
    await expect
        .poll(async () => (await db.getVoiceAgentDoc(agentId)).tools?.booking)
        .toMatchObject({ enabled: true, bookAppointment: false });

    // Turning check_availability off keeps the settings for next time.
    await tools(page).getByRole('switch', { name: 'Use check_availability' }).click();
    await page.getByRole('button', { name: 'Save tools' }).click();
    await expect(page.getByRole('button', { name: 'Save tools' })).toBeDisabled();
    await expect
        .poll(async () => (await db.getVoiceAgentDoc(agentId)).tools?.booking)
        .toMatchObject({ enabled: false, timezone: 'Europe/London', slotMinutes: 45 });
});

test('booking: impossible hours and limits are refused in plain words', async ({ page, db }) => {
    const agentId = await inboundAgent(db);
    await openVoiceAgent(page, agentId);
    await tools(page).getByRole('switch', { name: 'Use check_availability' }).click();
    await openVoiceTool(page, 'check_availability');
    const save = page.getByRole('button', { name: 'Save tools' });
    const error = page.getByTestId('booking-error');

    await page.getByLabel('Tuesday closes at').fill('08:00');
    await expect(error).toHaveText('Tuesday has to close after it opens');
    await expect(save).toBeDisabled();
    await page.getByLabel('Tuesday closes at').fill('09:20');
    await expect(error).toHaveText("Tuesday's hours are shorter than one 30-minute appointment");
    await page.getByLabel('Tuesday closes at').fill('17:00');
    await expect(error).toHaveCount(0);

    await page.locator('#booking-days-ahead').fill('120');
    await expect(error).toHaveText('Callers can book from 1 to 90 days ahead');
    await page.locator('#booking-days-ahead').fill('0');
    await expect(error).toHaveText('Callers can book from 1 to 90 days ahead');
    await page.locator('#booking-days-ahead').fill('7');

    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
        await page.getByRole('switch', { name: `Open on ${day}` }).click();
    }
    await expect(error).toHaveText('Open at least one day so callers can book');
    await expect(save).toBeDisabled();

    await tools(page).getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(tools(page).getByRole('switch', { name: 'Use check_availability' })).toHaveAttribute(
        'aria-checked',
        'false',
    );
    await expect(page.getByRole('switch', { name: 'Open on Monday' })).toHaveAttribute('aria-checked', 'true');
    await expect(save).toBeDisabled();
    await expect(error).toHaveCount(0);
    expect((await db.getVoiceAgentDoc(agentId)).tools).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Custom tools
// ---------------------------------------------------------------------------

test('custom tool: add, check the rules, edit, switch off and delete', async ({ page, db }) => {
    const agentId = await inboundAgent(db);
    await openVoiceAgent(page, agentId);
    const card = tools(page);
    await expect(card.getByTestId('custom-tool')).toHaveCount(0);

    await card.getByRole('button', { name: 'Add tool' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a custom tool' });
    const error = dialog.getByTestId('tool-error');
    const add = dialog.getByRole('button', { name: 'Add tool' });

    // The rules, before anything is saved.
    await add.click();
    await expect(error).toHaveText('Give the tool a name, like check_order');
    await dialog.getByLabel('Name', { exact: true }).fill('Check Order');
    await add.click();
    await expect(error).toContainText('Tool names are 2 to 40 lowercase letters');
    await dialog.getByLabel('Name', { exact: true }).fill('book_appointment');
    await add.click();
    await expect(error).toHaveText('That name belongs to a built-in tool. Pick another one.');
    await dialog.getByLabel('Name', { exact: true }).fill('check_order');
    await add.click();
    await expect(error).toHaveText('Say when the agent should use this tool');
    await dialog.getByLabel('When should the agent use this?').fill('When the caller asks where their order is.');
    await dialog.getByLabel('URL').fill('http://example.com/hooks/order');
    await add.click();
    // The server's rule: https only.
    await expect(error).toHaveText('The URL has to start with https://');
    await dialog.getByLabel('URL').fill('https://example.com/hooks/order');

    await dialog.getByRole('button', { name: 'Add parameter' }).click();
    await dialog.getByLabel('Parameter 1 name').fill('order_id');
    await dialog.getByLabel('Parameter 1 description').fill('The order number on their receipt');
    await dialog.getByRole('button', { name: 'Add parameter' }).click();
    await dialog.getByLabel('Parameter 2 name').fill('order_id');
    await add.click();
    await expect(error).toHaveText('There are two parameters called order_id');
    await dialog.getByLabel('Parameter 2 name').fill('express');
    await dialog.getByLabel('Parameter 2 type').click();
    await page.getByRole('option', { name: 'Yes / no' }).click();
    await dialog.getByLabel('Parameter 2 required').click();

    await add.click();
    await expect(page.getByText('Tool added')).toBeVisible();
    await expect(dialog).toHaveCount(0);

    const row = card.getByTestId('custom-tool');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('check_order');
    await expect(row).toContainText('When the caller asks where their order is.');
    await expect(row.getByTestId('tool-where')).toHaveText('Calls: example.com · 2 parameters');

    let [tool] = (await db.getVoiceAgentDoc(agentId)).tools?.webhooks ?? [];
    expect(tool).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{16}$/),
        name: 'check_order',
        description: 'When the caller asks where their order is.',
        parameters: [
            { name: 'order_id', type: 'string', description: 'The order number on their receipt', required: true },
            { name: 'express', type: 'boolean', description: '', required: false },
        ],
        url: 'https://example.com/hooks/order',
        secretSealed: null,
        enabled: true,
    });
    const toolId = tool.id;

    // A second tool cannot take the same name.
    await card.getByRole('button', { name: 'Add tool' }).click();
    await dialog.getByLabel('Name', { exact: true }).fill('check_order');
    await add.click();
    await expect(error).toHaveText('This agent already has a tool called check_order');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Opened: what it sends where. Edit.
    await openVoiceTool(page, 'check_order');
    await expect(row).toContainText('https://example.com/hooks/order');
    await expect(row).toContainText('order_id (Text), express (Yes / no, optional)');
    await row.getByRole('button', { name: 'Edit check_order' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit check_order' });
    await expect(edit.getByLabel('Parameter 1 name')).toHaveValue('order_id');
    await expect(edit.getByRole('button', { name: 'Save tool' })).toBeDisabled();
    await edit.getByLabel('When should the agent use this?').fill('When the caller wants an order status.');
    await edit.getByLabel('URL').fill('https://orders.example.com/status');
    await edit.getByRole('button', { name: 'Remove parameter 2' }).click();
    await edit.getByRole('button', { name: 'Save tool' }).click();
    await expect(page.getByText('Tool saved')).toBeVisible();
    await expect(row.getByTestId('tool-where')).toHaveText('Calls: orders.example.com · 1 parameter');
    [tool] = (await db.getVoiceAgentDoc(agentId)).tools?.webhooks ?? [];
    expect(tool).toMatchObject({
        id: toolId,
        description: 'When the caller wants an order status.',
        url: 'https://orders.example.com/status',
        parameters: [{ name: 'order_id' }],
    });

    // Off, and still off after a reload.
    await row.getByRole('switch', { name: 'Use check_order' }).click();
    await expect(page.getByText('check_order is off')).toBeVisible();
    expect((await db.getVoiceAgentDoc(agentId)).tools?.webhooks?.[0].enabled).toBe(false);
    await openVoiceAgent(page, agentId);
    await expect(tools(page).getByRole('switch', { name: 'Use check_order' })).toHaveAttribute('aria-checked', 'false');
    await tools(page).getByRole('switch', { name: 'Use check_order' }).click();
    await expect(page.getByText('check_order is on')).toBeVisible();
    expect((await db.getVoiceAgentDoc(agentId)).tools?.webhooks?.[0].enabled).toBe(true);

    // Delete, after a confirmation.
    await openVoiceTool(page, 'check_order');
    await tools(page).getByRole('button', { name: 'Delete check_order' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete check_order?' });
    await confirm.getByRole('button', { name: 'Delete tool' }).click();
    await expect(page.getByText('check_order deleted')).toBeVisible();
    await expect(tools(page).getByTestId('custom-tool')).toHaveCount(0);
    expect((await db.getVoiceAgentDoc(agentId)).tools?.webhooks).toEqual([]);
});

test('custom tool: the signing secret is sealed and never reaches the browser', async ({ page, db }) => {
    const agentId = await inboundAgent(db);
    // Every RSC / server-action payload the page receives, to check for the secret.
    const payloads: Promise<string>[] = [];
    page.on('response', (response: Response) => {
        const type = response.headers()['content-type'] ?? '';
        if (type.includes('text/x-component') || type.includes('text/html')) {
            payloads.push(response.text().catch(() => ''));
        }
    });

    await openVoiceAgent(page, agentId);
    await tools(page).getByRole('button', { name: 'Add tool' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a custom tool' });
    await dialog.getByLabel('Name', { exact: true }).fill('create_lead');
    await dialog.getByLabel('When should the agent use this?').fill('When the caller wants a quote.');
    await dialog.getByLabel('URL').fill('https://example.com/hooks/lead');
    await dialog.getByLabel('Signing secret').fill(FAKE_SECRET);
    await dialog.getByRole('button', { name: 'Add tool' }).click();
    await expect(page.getByText('Tool added')).toBeVisible();

    const [stored] = (await db.getVoiceAgentDoc(agentId)).tools?.webhooks ?? [];
    expect(stored.secretSealed).toMatch(/^v1\./);
    expect(stored.secretSealed).not.toContain(FAKE_SECRET);

    // A fresh server render of the page.
    await openVoiceAgent(page, agentId);
    await openVoiceTool(page, 'create_lead');
    await tools(page).getByRole('button', { name: 'Edit create_lead' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit create_lead' });
    await expect(edit.getByTestId('tool-secret-set')).toHaveText('Secret set');
    await expect(edit.locator('#tool-secret')).toHaveCount(0);

    // Saving with the secret kept leaves it as it was.
    await edit.getByLabel('URL').fill('https://example.com/hooks/lead2');
    await edit.getByRole('button', { name: 'Save tool' }).click();
    await expect(page.getByText('Tool saved')).toBeVisible();
    const [kept] = (await db.getVoiceAgentDoc(agentId)).tools?.webhooks ?? [];
    expect(kept.secretSealed).toBe(stored.secretSealed);

    const html = await page.content();
    const bodies = [html, ...(await Promise.all(payloads))].join('\n');
    expect(payloads.length).toBeGreaterThan(2);
    expect(bodies).not.toContain(FAKE_SECRET);
    expect(bodies).not.toContain(stored.secretSealed as string);
    expect(bodies).not.toContain('secretSealed');
    expect(bodies).toContain('"hasSecret":true');

    // Remove it.
    await tools(page).getByRole('button', { name: 'Edit create_lead' }).click();
    await edit.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(edit.getByText('The secret is removed when you save.')).toBeVisible();
    await edit.getByRole('button', { name: 'Save tool' }).click();
    await expect(edit).toHaveCount(0);
    await expect.poll(async () => (await db.getVoiceAgentDoc(agentId)).tools?.webhooks?.[0].secretSealed).toBeNull();
});

// ---------------------------------------------------------------------------
// Send test request
// ---------------------------------------------------------------------------

type Received = { method: string; url: string; headers: IncomingHttpHeaders; body: string };

/** A local stand-in for the owner's server: `/ok` answers JSON, `/fail` a 500, `/slow` never. */
async function startToolServer(): Promise<{ server: Server; base: string; received: Received[] }> {
    const received: Received[] = [];
    const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            received.push({
                method: req.method ?? '',
                url: req.url ?? '',
                headers: req.headers,
                body: Buffer.concat(chunks).toString('utf8'),
            });
            if (req.url === '/fail') {
                res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Order system is down');
            } else if (req.url === '/ok') {
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(
                    JSON.stringify({ status: 'shipped', eta: 'Thursday' }),
                );
            } else {
                res.writeHead(404).end();
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { server, base: `http://127.0.0.1:${port}`, received };
}

test('send test request: posts what the engine would, signed, and shows the answer', LOCAL_FETCH, async ({ page, db }) => {
    const { server, base, received } = await startToolServer();
    try {
        const agentId = await inboundAgent(db);
        await db.setVoiceAgentTools(agentId, {
            booking: null,
            webhooks: [webhookTool({ url: `${base}/ok`, secretSealed: sealForE2e(FAKE_SECRET) })],
        });
        await openVoiceAgent(page, agentId);
        await openVoiceTool(page, 'check_order');
        await tools(page).getByRole('button', { name: 'Edit check_order' }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit check_order' });

        await dialog.getByRole('button', { name: 'Send test request' }).click();
        const result = dialog.getByTestId('tool-test-result');
        await expect(result).toContainText('HTTP 200');
        await expect(result.getByTestId('tool-test-body')).toHaveText('{"status":"shipped","eta":"Thursday"}');
        await expect(result).toContainText('signed with your secret');

        expect(received).toHaveLength(1);
        const [request] = received;
        expect(request.method).toBe('POST');
        expect(request.url).toBe('/ok');
        expect(request.headers['content-type']).toBe('application/json');
        expect(request.headers['user-agent']).toBe('AixelLabs-VoiceAgent/1');
        const signature = createHmac('sha256', FAKE_SECRET).update(request.body).digest('hex');
        expect(request.headers['x-aixel-signature']).toBe(`sha256=${signature}`);
        expect(JSON.parse(request.body)).toEqual({
            tool: 'check_order',
            arguments: { order_id: 'example', quantity: 1, express: true },
            call: {
                id: expect.stringMatching(/^[0-9a-f]{24}$/),
                agentId,
                channel: 'PLAYGROUND',
                direction: 'PLAYGROUND',
                from: null,
                to: null,
            },
        });

        // What is in the dialog is what gets tested, saved or not: a failing URL, then no secret.
        await dialog.getByLabel('URL').fill(`${base}/fail`);
        await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
        await dialog.getByRole('button', { name: 'Send test request' }).click();
        await expect(result).toContainText('HTTP 500');
        await expect(result).toContainText('On a call, the agent would say it could not do that right now.');
        await expect(result.getByTestId('tool-test-body')).toHaveText('Order system is down');
        expect(received).toHaveLength(2);
        expect(received[1].headers['x-aixel-signature']).toBeUndefined();

        // Nothing listening.
        await dialog.getByLabel('URL').fill('http://127.0.0.1:9/nothing');
        await dialog.getByRole('button', { name: 'Send test request' }).click();
        await expect(result).toContainText('No answer');
        await expect(result).toContainText('refused the connection');

        // Testing saved nothing.
        const [stored] = (await db.getVoiceAgentDoc(agentId)).tools?.webhooks ?? [];
        expect(stored.url).toBe(`${base}/ok`);
        expect(stored.secretSealed).toMatch(/^v1\./);
    } finally {
        server.close();
    }
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function seedFullTools(db: E2eDb): Promise<string> {
    const agentId = await inboundAgent(db, 'Sunrise Dental');
    await db.setVoiceAgentTools(agentId, {
        booking: {
            enabled: true,
            timezone: 'Asia/Kolkata',
            slotMinutes: 30,
            maxDaysAhead: 30,
            hours: {
                mon: { open: '09:00', close: '18:00' },
                tue: { open: '09:00', close: '18:00' },
                wed: { open: '09:00', close: '18:00' },
                thu: { open: '09:00', close: '18:00' },
                fri: { open: '09:00', close: '18:00' },
                sat: { open: '10:00', close: '14:00' },
            },
        },
        webhooks: [
            webhookTool({ secretSealed: sealForE2e(FAKE_SECRET) }),
            webhookTool({
                id: '0f1e2d3c4b5a6978',
                name: 'create_lead_in_crm_with_a_long_name',
                url: 'https://hooks.example-crm-provider.com/v1/leads',
                parameters: [],
                enabled: false,
            }),
        ],
    });
    return agentId;
}

/**
 * The page shell stays put: only the page's own container scrolls. A jump that also scrolls the shell moves the
 * header off the top and leaves a blank strip under the last card.
 */
async function expectShellInPlace(page: Page): Promise<void> {
    const shell = await page.evaluate(() => {
        const inset = document.getElementById('sidebar-inset')!;
        const container = document.getElementById('page-children-container')!.getBoundingClientRect();
        return {
            insetScrolled: inset.scrollTop,
            documentTaller: document.documentElement.scrollHeight - window.innerHeight,
            headerTop: document.getElementById('header')!.getBoundingClientRect().top,
            blankBelow: window.innerHeight - container.bottom,
        };
    });
    expect(shell.insetScrolled).toBe(0);
    expect(shell.documentTaller).toBeLessThanOrEqual(0);
    expect(shell.headerTop).toBeGreaterThanOrEqual(0);
    // The scroll container reaches the bottom of the screen, less the shell's own padding.
    expect(shell.blankBelow).toBeLessThanOrEqual(16);
}

for (const [label, size] of [
    ['desktop', { width: 1440, height: 900 }],
    ['a 390 px phone', { width: 390, height: 844 }],
] as const) {
    test(`jumping to Tools and opening a tool keeps the page in place (${label})`, async ({ page, db }) => {
        await page.setViewportSize(size);
        const agentId = await db.insertVoiceAgent(E2E_USER, {
            name: 'Maya',
            callType: VoiceAgentCallType.INBOUND,
            prompt: 'Offer times with check_availability, then book_appointment.',
        });
        await openVoiceAgent(page, agentId);
        await page.getByRole('button', { name: 'Go to Tools' }).first().click();
        await expect(tools(page).getByRole('switch', { name: 'Use check_availability' })).toBeInViewport();
        await expectShellInPlace(page);
        await openVoiceTool(page, 'check_availability');
        await expectShellInPlace(page);
        // Scrolled to the end: the last card is on screen, with nothing blank under it.
        await page.mouse.wheel(0, 20_000);
        await expect(page.locator('#page-children-container [data-slot="card"]').last()).toBeInViewport();
        await expectShellInPlace(page);
    });
}

test('the Tools card fits a desktop screen', async ({ page, db }) => {
    const agentId = await seedFullTools(db);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openVoiceAgent(page, agentId);
    await tools(page).scrollIntoViewIfNeeded();
    await expect(tools(page).getByTestId('custom-tool')).toHaveCount(2);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    mkdirSync(SCREENSHOTS, { recursive: true });
    await tools(page).screenshot({ path: path.join(SCREENSHOTS, 'tools-desktop.png') });
    await openVoiceTool(page, 'check_availability');
    await tools(page).screenshot({ path: path.join(SCREENSHOTS, 'tools-desktop-booking.png') });

    await openVoiceTool(page, 'check_order');
    await tools(page).getByRole('button', { name: 'Edit check_order' }).click();
    await page
        .getByRole('dialog', { name: 'Edit check_order' })
        .screenshot({ path: path.join(SCREENSHOTS, 'tool-dialog-desktop.png') });
});

test.describe('on a 390 px phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('booking hours, the tool list and the dialog fit without sideways scrolling', async ({ page, db }) => {
        const agentId = await seedFullTools(db);
        await openVoiceAgent(page, agentId);
        const card = tools(page);
        await card.scrollIntoViewIfNeeded();
        await expect(card.getByTestId('custom-tool')).toHaveCount(2);
        await openVoiceTool(page, 'check_availability');
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

        // The card itself fits the screen (the page clips overflow, so check the box, not just scrollWidth).
        const cardBox = await card.boundingBox();
        expect(cardBox && cardBox.x >= 0 && cardBox.x + cardBox.width <= 390).toBe(true);
        // ...and nothing inside it is wider than the card (wide content would be clipped at the right).
        expect(await card.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
        // Every open day's two times sit inside the card.
        for (const day of ['mon', 'sat']) {
            const closes = page.getByTestId(`booking-day-${day}`).locator('input[type="time"]').last();
            const box = await closes.boundingBox();
            expect(box && cardBox && box.x + box.width <= cardBox.x + cardBox.width).toBe(true);
        }
        // Edit and delete stay reachable on a long name.
        const longRow = await openVoiceTool(page, 'create_lead_in_crm_with_a_long_name');
        await longRow.scrollIntoViewIfNeeded();
        const deleteBox = await longRow
            .getByRole('button', { name: 'Delete create_lead_in_crm_with_a_long_name' })
            .boundingBox();
        expect(deleteBox && deleteBox.x >= 0 && deleteBox.x + deleteBox.width <= 390).toBe(true);

        mkdirSync(SCREENSHOTS, { recursive: true });
        await card.screenshot({ path: path.join(SCREENSHOTS, 'tools-390.png') });
        await card.getByText('Tools', { exact: true }).scrollIntoViewIfNeeded();
        await page.mouse.wheel(0, -80);
        await page.screenshot({ path: path.join(SCREENSHOTS, 'tools-390-top.png') });

        await openVoiceTool(page, 'check_order');
        await card.getByRole('button', { name: 'Edit check_order' }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit check_order' });
        await expect(dialog.getByLabel('Parameter 3 name')).toHaveValue('express');
        const dialogBox = await dialog.boundingBox();
        expect(dialogBox && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390).toBe(true);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: path.join(SCREENSHOTS, 'tool-dialog-390.png') });
    });
});
