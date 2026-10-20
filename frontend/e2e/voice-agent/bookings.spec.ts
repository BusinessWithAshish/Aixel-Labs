import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import {
    Modules,
    VOICE_AGENT_SUB_MODULES,
    VoiceBookingStatus,
    VoiceCallChannel,
    VoiceCallDirection,
    type VoiceBookingDoc,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { VOICE_AGENTS_URL, waitForHydration } from '../support/voice-agents';
import { E2E_ADMIN, E2E_USER } from '../support/users';
import { CALL_LOGS_URL } from './fake-telephony';

const BOOKINGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS];

type SeedBooking = Omit<VoiceBookingDoc, '_id' | 'tenantId' | 'userId' | 'createdAt' | 'updatedAt'>;

function booking(fields: Partial<SeedBooking> & Pick<SeedBooking, 'agentId' | 'start' | 'customerName'>): SeedBooking {
    return {
        callId: null,
        channel: VoiceCallChannel.PHONE,
        end: new Date(fields.start.getTime() + 30 * 60_000),
        timezone: 'Asia/Kolkata',
        customerPhone: null,
        notes: null,
        status: VoiceBookingStatus.BOOKED,
        ...fields,
    };
}

async function openBookings(page: Page, query = ''): Promise<void> {
    await page.goto(`${BOOKINGS_URL}${query}`);
    await waitForHydration(page, '#bookings-agent-filter');
}

// The viewer sits in New York; the agent books in India. Both clocks must show.
test.use({ storageState: USER_STORAGE_STATE, timezoneId: 'America/New_York' });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.resetVoiceBookings(E2E_USER);
});

test('with no bookings, says how they appear and links to the agents', async ({ page }) => {
    await openBookings(page);
    const empty = page.getByTestId('bookings-empty');
    await expect(empty).toContainText('No bookings yet');
    await expect(empty).toContainText('Turn on Appointment booking in an agent’s Tools');
    await empty.getByRole('link', { name: 'Open agents' }).click();
    await expect(page).toHaveURL(VOICE_AGENTS_URL);
});

test.describe('with seeded bookings', () => {
    let frontDeskId: string;
    let salesId: string;
    let callId: string;
    let ravi: string;
    let cancelledId: string;

    test.beforeEach(async ({ db }) => {
        frontDeskId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk' });
        salesId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales' });
        [callId] = await db.insertVoiceCalls(E2E_USER, [
            {
                agentId: new ObjectId(frontDeskId),
                channel: VoiceCallChannel.PHONE,
                direction: VoiceCallDirection.INBOUND,
                from: '+919876543210',
                to: '+919484950416',
                voice: 'sulafat',
                startedAt: new Date(Date.now() - 60_000),
                endedAt: new Date(),
                durationSec: 60,
                endedBy: 'goodbye',
                flags: [],
                turns: [{ role: 'agent', text: 'You are booked for Saturday at two.' }],
                gapsMs: [],
            },
        ]);
        [ravi, , cancelledId] = await db.insertVoiceBookings(E2E_USER, [
            booking({
                agentId: new ObjectId(frontDeskId),
                callId: new ObjectId(callId),
                start: new Date('2030-03-16T08:30:00Z'),
                customerName: 'Ravi Kumar',
                customerPhone: '+919876543210',
                notes: 'First visit, wants a cleaning.',
            }),
            booking({
                agentId: new ObjectId(salesId),
                channel: VoiceCallChannel.PLAYGROUND,
                start: new Date('2030-03-15T04:30:00Z'),
                customerName: 'Meera',
            }),
            booking({
                agentId: new ObjectId(frontDeskId),
                start: new Date('2030-04-01T05:00:00Z'),
                customerName: 'Arjun',
                status: VoiceBookingStatus.CANCELLED,
            }),
            booking({
                agentId: new ObjectId(frontDeskId),
                start: new Date('2025-12-05T10:00:00Z'),
                customerName: 'Old customer',
            }),
        ]);
    });

    test('lists upcoming soonest first, then past, with both clocks and every detail', async ({ page }) => {
        await openBookings(page);

        const upcoming = page.getByTestId('bookings-upcoming').getByTestId('booking');
        await expect(upcoming).toHaveCount(3);
        await expect(upcoming.nth(0)).toContainText('Meera');
        await expect(upcoming.nth(0)).toContainText('Sales');
        await expect(upcoming.nth(0)).toContainText('Playground');
        await expect(upcoming.nth(0).getByTestId('booking-slot')).toHaveText('Fri, 15 Mar 2030, 10:00 – 10:30 AM');

        const first = upcoming.nth(1);
        await expect(first.getByTestId('booking-slot')).toHaveText('Sat, 16 Mar 2030, 2:00 – 2:30 PM');
        await expect(first.getByTestId('booking-zone')).toContainText('Kolkata time');
        await expect(first.getByTestId('booking-viewer-time')).toHaveText('Your time: Sat, 16 Mar 2030, 4:30 – 5:00 AM');
        await expect(first.getByTestId('booking-customer')).toHaveText('Ravi Kumar');
        await expect(first.getByRole('link', { name: '+919876543210' })).toHaveAttribute('href', 'tel:+919876543210');
        await expect(first).toContainText('First visit, wants a cleaning.');
        await expect(first).toContainText('Front desk');
        await expect(first).toContainText('Booked');
        await expect(first).toHaveAttribute('id', `booking-${ravi}`);

        await expect(upcoming.nth(2)).toHaveAttribute('data-status', VoiceBookingStatus.CANCELLED);
        await expect(upcoming.nth(2)).toContainText('Cancelled');
        await expect(upcoming.nth(2).getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);

        const past = page.getByTestId('bookings-past').getByTestId('booking');
        await expect(past).toHaveCount(1);
        await expect(past.first()).toContainText('Old customer');
        await expect(past.first()).toContainText('Done');
        await expect(past.first().getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);

        // The call that booked it opens its log.
        await first.getByTestId('booking-call-link').click();
        await expect(page).toHaveURL(`${CALL_LOGS_URL}/${callId}`);
        await expect(page.getByTestId('transcript-turn')).toContainText('You are booked for Saturday at two.');
    });

    test('filters by agent through the URL', async ({ page }) => {
        await openBookings(page);
        await page.getByRole('combobox', { name: 'Agent' }).click();
        await page.getByRole('option', { name: 'Sales', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`\\?agent=${salesId}$`));
        await expect(page.getByTestId('booking')).toHaveCount(1);
        await expect(page.getByTestId('booking')).toContainText('Meera');

        await page.getByRole('combobox', { name: 'Agent' }).click();
        await page.getByRole('option', { name: 'All agents' }).click();
        await expect(page.getByTestId('booking')).toHaveCount(4);
    });

    test('cancels a booking after confirming, and keeping it changes nothing', async ({ page, db }) => {
        await openBookings(page);
        const card = page.locator(`#booking-${ravi}`);

        await card.getByRole('button', { name: 'Cancel booking' }).click();
        let dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
        await expect(dialog).toContainText('Ravi Kumar · Sat, 16 Mar 2030, 2:00 – 2:30 PM');
        await dialog.getByRole('button', { name: 'Keep it' }).click();
        await expect(dialog).toHaveCount(0);
        expect((await db.getVoiceBookings(E2E_USER)).find((b) => b._id.toString() === ravi)?.status).toBe(
            VoiceBookingStatus.BOOKED,
        );

        await card.getByRole('button', { name: 'Cancel booking' }).click();
        dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
        await dialog.getByRole('button', { name: 'Cancel booking' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(card).toHaveAttribute('data-status', VoiceBookingStatus.CANCELLED);
        await expect(card).toContainText('Cancelled');
        await expect(card.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);

        const stored = (await db.getVoiceBookings(E2E_USER)).find((b) => b._id.toString() === ravi);
        expect(stored?.status).toBe(VoiceBookingStatus.CANCELLED);
        expect(stored?.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
        // The other cancelled one was already cancelled; the rest are untouched.
        const statuses = (await db.getVoiceBookings(E2E_USER)).map((b) => [b._id.toString(), b.status]);
        expect(statuses.filter(([, status]) => status === VoiceBookingStatus.CANCELLED).map(([id]) => id).sort()).toEqual(
            [ravi, cancelledId].sort(),
        );
    });

    test('a call that booked links to the booking and shows a badge in the call list', async ({ page, db }) => {
        await db.resetVoiceTelephony(E2E_USER);
        const [bookedCall] = await db.insertVoiceCalls(E2E_USER, [
            {
                agentId: new ObjectId(frontDeskId),
                channel: VoiceCallChannel.PHONE,
                direction: VoiceCallDirection.INBOUND,
                from: '+919876543210',
                to: '+919484950416',
                voice: 'sulafat',
                startedAt: new Date(Date.now() - 60_000),
                endedAt: new Date(),
                durationSec: 60,
                endedBy: 'goodbye',
                flags: [],
                turns: [
                    { role: 'caller', text: 'Can I come in on the sixteenth at two?' },
                    { role: 'agent', text: 'Booked. See you then, Ravi.' },
                ],
                gapsMs: [700],
                toolCalls: [
                    {
                        name: 'book_appointment',
                        arguments: { date: '2030-03-16', time: '14:00', name: 'Ravi' },
                        result: 'Booked Saturday 16 March 2030 at 2:00 PM.',
                        ok: true,
                        afterTurn: 1,
                        durationMs: 40,
                        bookingId: ravi,
                    },
                ],
            },
        ]);
        await page.goto(CALL_LOGS_URL);
        await expect(page.getByTestId('call-row').first().getByTestId('call-booked')).toHaveText('Booked');

        await page.goto(`${CALL_LOGS_URL}/${bookedCall}`);
        await page.getByTestId('tool-call-booking-link').click();
        await expect(page).toHaveURL(`${BOOKINGS_URL}#booking-${ravi}`);
        await expect(page.locator(`#booking-${ravi}`)).toBeVisible();
    });
});

test('shows in the sidebar and opens for a user granted only Bookings', async ({ page, db }) => {
    await openBookings(page);
    await expect(page.locator(`a[href="${BOOKINGS_URL}"]`).first()).toBeAttached();

    await db.resetUser(E2E_USER, {
        moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS] },
    });
    await openBookings(page);
    await expect(page.getByTestId('bookings-empty')).toBeVisible();
});

test('a user without the Bookings grant gets a 404', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.CALL_LOGS] } });
    await page.goto(BOOKINGS_URL);
    await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
});

test('someone else’s bookings are not shown', async ({ page, db }) => {
    const adminAgent = await db.insertVoiceAgent(E2E_ADMIN, { name: 'Admin agent' });
    await db.insertVoiceBookings(E2E_ADMIN, [
        booking({ agentId: new ObjectId(adminAgent), start: new Date('2030-05-01T05:00:00Z'), customerName: 'Admin customer' }),
    ]);
    try {
        await openBookings(page);
        await expect(page.getByTestId('bookings-empty')).toBeVisible();
        await expect(page.getByText('Admin customer')).toHaveCount(0);
    } finally {
        await db.resetVoiceBookings(E2E_ADMIN);
        await db.resetVoiceAgents(E2E_ADMIN);
    }
});
