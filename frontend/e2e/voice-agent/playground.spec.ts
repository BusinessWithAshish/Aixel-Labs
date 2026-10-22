import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { FAKE_MIC_LAUNCH_ARGS, FakePlaygroundEngine, openVoiceAgent } from '../support/voice-agents';
import { sendPlaygroundTool } from './fake-telephony';

/**
 * The playground against a stand-in engine socket (`page.routeWebSocket`) and Chromium's fake
 * microphone. Nothing reaches a real engine, model or phone line.
 */
test.use({
    storageState: USER_STORAGE_STATE,
    permissions: ['microphone'],
    launchOptions: { args: FAKE_MIC_LAUNCH_ARGS },
});

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
});

async function startCall(page: Page, engine: FakePlaygroundEngine): Promise<void> {
    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByTestId('playground-status')).toHaveText('Live');
    await expect.poll(() => engine.connected).toBe(true);
}

test('streams the mic up and renders transcript, gaps, clear and the end', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const user = await db.getUser(E2E_USER);
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);

    await startCall(page, engine);

    // A signed URL for this agent and user, minted by the server.
    const url = new URL(engine.urls[0]);
    expect(url.searchParams.get('agent')).toBe(agentId);
    expect(url.searchParams.get('user')).toBe(user._id.toString());
    expect(url.searchParams.get('t')).toMatch(/^\d+\.[0-9a-f]{32}$/);

    // Mic audio goes up as binary 20 ms frames of 16 kHz mono Int16 (640 bytes, ~32 kB/s).
    await expect.poll(() => engine.audioFrames.length).toBeGreaterThan(10);
    const rate = await engine.measureUpstreamRate(1500);
    expect(rate).toBeGreaterThan(24_000);
    expect(rate).toBeLessThan(40_000);
    expect(new Set(engine.audioFrames.map((f) => f.bytes))).toEqual(new Set([640]));
    expect(engine.textFrames).toEqual([]);

    // Transcript pieces of one reply join into one bubble; each side gets its own.
    const transcript = page.getByTestId('playground-transcript');
    engine.sendEvent({ type: 'transcript', role: 'agent', text: 'Hi, quick one.' });
    engine.sendEvent({ type: 'transcript', role: 'agent', text: ' Do you have a website?' });
    engine.sendEvent({ type: 'transcript', role: 'caller', text: 'No, we just take calls.' });
    engine.sendEvent({ type: 'transcript', role: 'caller', text: "I've got a minute." });
    engine.sendEvent({ type: 'turn', gapMs: 642.4 });
    engine.sendEvent({ type: 'transcript', role: 'agent', text: "That's actually why I called." });

    await expect(transcript.getByTestId('transcript-agent')).toHaveCount(2);
    await expect(transcript.getByTestId('transcript-agent').first()).toContainText('Hi, quick one. Do you have a website?');
    // Caller fragments in quick succession share one bubble too.
    await expect(transcript.getByTestId('transcript-caller')).toHaveCount(1);
    await expect(transcript.getByTestId('transcript-caller')).toContainText("No, we just take calls. I've got a minute.");
    await expect(transcript.getByTestId('transcript-gap')).toHaveText('answered in 0.6 s');
    await expect(page.getByTestId('playground-last-gap')).toHaveText('0.6 s');
    await expect(page.getByTestId('playground-replies')).toHaveText('1');
    await expect(page.getByTestId('playground-speed')).toContainText('Usually 0.6 s (feels natural) · last answer 0.6 s');

    // Her audio plays until the engine says clear, then stops at once. A clear with nothing queued is harmless.
    const speaking = page.getByTestId('agent-speaking');
    engine.sendEvent({ type: 'clear' });
    await expect(speaking).toHaveAttribute('data-speaking', 'false');
    engine.sendAgentAudio(6);
    await expect(speaking).toHaveAttribute('data-speaking', 'true');
    engine.sendEvent({ type: 'clear' });
    await expect(speaking).toHaveAttribute('data-speaking', 'false', { timeout: 1_000 });

    // The engine ends the call: the reason shows and the page stops sending.
    engine.sendEvent({ type: 'ended', reason: 'goodbye' });
    await expect(page.getByTestId('playground-ended')).toHaveText('She said goodbye and hung up.');
    await expect(page.getByTestId('playground-status')).toHaveText('Ended');
    await expect.poll(() => engine.closedByPage).toBe(true);
    const sent = engine.audioFrames.length;
    await page.waitForTimeout(300);
    expect(engine.audioFrames.length).toBe(sent);
    // The transcript stays for review after the call.
    await expect(transcript.getByTestId('transcript-agent')).toHaveCount(2);
});

test('End call closes the socket', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);

    await startCall(page, engine);
    await page.getByRole('button', { name: 'End call' }).click();

    await expect(page.getByTestId('playground-ended')).toHaveText('You ended the call.');
    await expect.poll(() => engine.closedByPage).toBe(true);
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
});

test('saves unsaved edits before the call starts', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya', prompt: 'Old prompt.' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);

    await page.locator('#agent-prompt').fill('New prompt, tested live.');
    await expect(page.getByText('Starting a call saves them first.')).toBeVisible();
    await page.getByRole('button', { name: 'Save and start call' }).click();

    await expect(page.getByTestId('playground-status')).toHaveText('Live');
    expect(engine.urls).toHaveLength(1);
    expect((await db.getVoiceAgents(E2E_USER))[0].prompt).toBe('New prompt, tested live.');
});

test('will not start without a prompt, on the page or on the server', async ({ page, db }) => {
    const engine = await FakePlaygroundEngine.install(page);
    const blank = await db.insertVoiceAgent(E2E_USER, { name: 'Blank', prompt: '' });
    await openVoiceAgent(page, blank);
    await expect(page.getByTestId('playground-no-prompt')).toHaveText(
        'This agent has no prompt yet, so it would not know what to say. Pick a template or write a prompt first.',
    );
    await expect(page.getByRole('button', { name: 'Start call' })).toBeDisabled();

    // Emptied after the page loaded: the server refuses before any socket opens.
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    await openVoiceAgent(page, agentId);
    await db.setVoiceAgentFields(agentId, { prompt: '' });
    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByTestId('voice-playground').getByRole('alert')).toContainText('This agent has no prompt yet');
    expect(engine.connected).toBe(false);
});

test('says so when the engine cannot be reached', async ({ page, db }) => {
    // No socket route: the e2e engine port is closed.
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    await openVoiceAgent(page, agentId);

    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByTestId('voice-playground').getByRole('alert')).toHaveText('Could not reach the voice engine.');
    await expect(page.getByTestId('playground-status')).toHaveText('Failed');
});

test('shows why the engine refused the call', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);

    await startCall(page, engine);
    await engine.close(1013, 'busy');

    await expect(page.getByTestId('voice-playground').getByRole('alert')).toHaveText(
        'The voice engine is busy with other calls (busy). Try again in a minute.',
    );
    await expect(page.getByTestId('playground-status')).toHaveText('Failed');
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
});

test('the transcript scrolls inside its own box, follows new lines, and stops following when you scroll up', async ({
    page,
    db,
}) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);
    await startCall(page, engine);

    const transcript = page.getByTestId('playground-transcript');
    const pageHeight = () => page.evaluate(() => document.getElementById('page-children-container')?.scrollHeight ?? 0);
    const box = () =>
        transcript.evaluate((el) => ({
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
        }));
    const before = await pageHeight();
    const emptyBox = await box();

    for (let i = 0; i < 30; i++) {
        engine.sendEvent({ type: 'transcript', role: i % 2 ? 'caller' : 'agent', text: `Line number ${i}, long enough to wrap a bit.` });
    }
    await expect(transcript.locator('li')).toHaveCount(30);

    // The box keeps its height, the page does not grow, and the newest line is in view.
    const full = await box();
    expect(full.clientHeight).toBe(emptyBox.clientHeight);
    expect(full.scrollHeight).toBeGreaterThan(full.clientHeight * 2);
    await expect.poll(async () => (await box()).fromBottom).toBeLessThan(2);
    expect(await pageHeight()).toBe(before);

    // Scrolled up to read: new lines do not pull the view down; a button jumps to them.
    await transcript.evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
    });
    engine.sendEvent({ type: 'transcript', role: 'agent', text: 'A line that arrives while reading.' });
    await expect(transcript.getByText('A line that arrives while reading.')).toBeAttached();
    expect(await transcript.evaluate((el) => el.scrollTop)).toBe(0);
    await page.getByTestId('transcript-jump-latest').click();
    await expect.poll(async () => (await box()).fromBottom).toBeLessThan(2);
    await expect(page.getByTestId('transcript-jump-latest')).toHaveCount(0);

    // Back at the bottom it follows again.
    engine.sendEvent({ type: 'transcript', role: 'caller', text: 'And one more.' });
    await expect(transcript.getByText('And one more.')).toBeAttached();
    await expect.poll(async () => (await box()).fromBottom).toBeLessThan(2);
});

test('tool events from the engine show as compact rows in the chat', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);
    await startCall(page, engine);

    const transcript = page.getByTestId('playground-transcript');
    engine.sendEvent({ type: 'transcript', role: 'caller', text: 'Can I come in on Saturday at two? I am Ravi.' });
    sendPlaygroundTool(engine, {
        name: 'check_availability',
        arguments: { date: '2026-10-17' },
        result: 'Free on Saturday 17 October: 2:00 PM, 2:30 PM.',
        ok: true,
    });
    sendPlaygroundTool(engine, {
        name: 'book_appointment',
        arguments: { date: '2026-10-17', time: '14:00', name: 'Ravi' },
        result: 'Booked Saturday 17 October at 2:00 PM.',
        ok: true,
    });
    sendPlaygroundTool(engine, { name: 'crm_lookup', arguments: { phone: '+15550100' }, result: 'timeout', ok: false });
    engine.sendEvent({ type: 'transcript', role: 'agent', text: 'You are booked, Ravi.' });

    const rows = transcript.getByTestId('tool-call');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveText(/Checked availability · Sat 17 Oct/);
    await expect(rows.nth(1)).toHaveText(/Booked Sat 17 Oct, 2:00 PM for Ravi/);
    await expect(rows.nth(1).getByTestId('tool-call-booking-link')).toHaveAttribute('href', '/voice-agent/bookings');
    await expect(rows.nth(2)).toHaveText(/crm_lookup/);
    await expect(rows.nth(2).getByTestId('tool-call-status')).toHaveText('Failed');
    // A tool between two lines keeps them as separate bubbles, in order.
    const order = await transcript.locator('ol > li').evaluateAll((items) => items.map((li) => li.getAttribute('data-testid')));
    expect(order).toEqual(['transcript-caller', 'transcript-tool', 'transcript-tool', 'transcript-tool', 'transcript-agent']);

    // Its title is a link to Bookings: open the details from the row's edge, not the middle.
    await rows.nth(1).locator('summary').click({ position: { x: 4, y: 4 } });
    await expect(rows.nth(1)).toContainText('"time": "14:00"');
    await expect(rows.nth(1)).toContainText('Booked Saturday 17 October at 2:00 PM.');
});
