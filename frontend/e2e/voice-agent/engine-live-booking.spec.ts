import path from 'node:path';
import { VoiceAgentCallType, VoiceBookingStatus } from '@aixellabs/backend/db/types';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { FAKE_MIC_LAUNCH_ARGS, openVoiceAgent } from '../support/voice-agents';
import { DEFAULT_INBOUND_VOICE_AGENT_PROMPT } from '@/helpers/voice-agent-defaults';

/**
 * Appointment booking against the REAL voice engine and model: the caller asks for Saturday at 2 pm,
 * she checks availability, books it, and the booking shows on the Bookings page. Skipped unless
 * `VOICE_E2E_ENGINE=1` (engine on the e2e port against the e2e Mongo, see engine-live.spec.ts), with
 * `VOICE_E2E_BOOKING_WAV` = a 16 kHz wav of a caller asking for "Saturday at two ... Ravi Kumar",
 * then "Yes please, book it.", then a long silence.
 */
test.skip(process.env.VOICE_E2E_ENGINE !== '1' || !process.env.VOICE_E2E_BOOKING_WAV, 'needs the real voice engine and a caller wav');

test.use({
    storageState: USER_STORAGE_STATE,
    permissions: ['microphone'],
    launchOptions: {
        args: [...FAKE_MIC_LAUNCH_ARGS, `--use-file-for-fake-audio-capture=${path.resolve(process.env.VOICE_E2E_BOOKING_WAV ?? '')}`],
    },
});

const TIMEZONE = 'Asia/Kolkata';
const OPEN = { open: '09:00', close: '18:00' };

/** The next Saturday after today, as YYYY-MM-DD in the booking timezone. */
function nextSaturday(): string {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    const days = ((6 - today.getDay() + 7) % 7) || 7;
    today.setDate(today.getDate() + days);
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.resetVoiceBookings(E2E_USER);
});

test('she checks availability, books Saturday at 2 pm, and the booking is on the Bookings page', async ({ page, db }) => {
    test.setTimeout(150_000);
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Front desk',
        voice: 'kore',
        callType: VoiceAgentCallType.INBOUND,
        prompt: DEFAULT_INBOUND_VOICE_AGENT_PROMPT,
        callNotes: 'Business: Sunrise Dental\nHours: Monday to Saturday, 9am to 6pm\nServices: cleanings, check-ups, whitening',
    });
    await db.setVoiceAgentTools(agentId, {
        booking: {
            enabled: true,
            timezone: TIMEZONE,
            slotMinutes: 30,
            maxDaysAhead: 30,
            hours: { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN },
        },
        webhooks: [],
    });
    await openVoiceAgent(page, agentId);

    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByTestId('playground-status')).toHaveText('Live', { timeout: 15_000 });
    await expect(page.getByText(/booked .*ravi/i).first()).toBeVisible({ timeout: 90_000 });

    const saturday = nextSaturday();
    await expect.poll(async () => (await db.getVoiceBookings(E2E_USER)).length, { timeout: 10_000 }).toBe(1);
    const [booking] = await db.getVoiceBookings(E2E_USER);
    expect(booking.status).toBe(VoiceBookingStatus.BOOKED);
    expect(booking.customerName).toMatch(/ravi/i);
    expect(booking.start.toISOString()).toBe(new Date(`${saturday}T14:00:00+05:30`).toISOString());

    // She tells the caller it is booked, after the tool succeeded.
    await page.waitForTimeout(10_000);
    await page.getByRole('button', { name: /end call/i }).click();
    await expect.poll(async () => (await db.getVoiceCalls(E2E_USER)).length, { timeout: 15_000 }).toBe(1);
    const [call] = await db.getVoiceCalls(E2E_USER);
    const names = (call.toolCalls ?? []).map((t) => t.name);
    expect(names).toContain('book_appointment');
    expect(booking.callId?.toString()).toBe(call._id.toString());
    const booked = (call.toolCalls ?? []).find((t) => t.name === 'book_appointment');
    const afterBooking = call.turns.slice(booked?.afterTurn ?? 0).filter((t) => t.role === 'agent');
    expect(afterBooking.map((t) => t.text).join(' ')).toMatch(/saturday|two|2(:00)?\s*(pm|p\.m\.)|book/i);

    await page.goto('/voice-agent/bookings');
    await expect(page.getByText(/ravi/i).first()).toBeVisible();
    await page.screenshot({ path: 'node_modules/.cache/e2e/live-booking-bookings.png', fullPage: true });
    await page.goto(`/voice-agent/call-logs/${call._id.toString()}`);
    await expect(page.getByText(/booked .*ravi/i).first()).toBeVisible();
    await page.screenshot({ path: 'node_modules/.cache/e2e/live-booking-call.png', fullPage: true });
});
