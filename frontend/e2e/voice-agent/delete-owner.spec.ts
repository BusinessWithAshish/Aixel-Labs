import { ObjectId } from 'mongodb';
import { VoiceAgentCallType, VoiceCalendarProvider, VoiceCallChannel, VoiceCallDirection } from '@aixellabs/backend/db/types';
import { MANAGE_TENANTS_PREFIX } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { ADMIN_STORAGE_STATE, E2E_TENANT } from '../support/env';
import type { E2eUser } from '../support/users';
import { waitForHydration } from '../support/voice-agents';
import { sealForE2e } from './fake-telephony';

/**
 * Deleting a user deletes their voice data too, like their lead data. Their provider and Composio
 * accounts are not reachable here (nothing listens on the fakes' ports), which is the case the
 * delete must survive: the outside cleanup is best effort and never keeps the data.
 */
test.use({ storageState: ADMIN_STORAGE_STATE });

const LEAVER: E2eUser = { firebaseUid: 'e2e-voice-leaver', email: 'leaver@e2e.aixellabs.test', name: 'Voice Leaver', isAdmin: false };

test('deleting a user deletes everything voice they own', async ({ page, db }) => {
    const userId = await db.insertMember(LEAVER);
    const agentId = await db.insertVoiceAgent(LEAVER, { name: 'Leaver agent', callType: VoiceAgentCallType.INBOUND });
    const numberId = await db.insertVoiceNumber(LEAVER, {
        phoneNumber: '+15550001111',
        providerNumberId: 'num-leaver',
        apiKeySealed: sealForE2e('KEY_LEAVER'),
        inboundAgentId: new ObjectId(agentId),
    });
    const now = new Date();
    const [callId] = await db.insertVoiceCalls(LEAVER, [
        {
            agentId: new ObjectId(agentId),
            numberId: new ObjectId(numberId),
            channel: VoiceCallChannel.PHONE,
            direction: VoiceCallDirection.INBOUND,
            from: '+919800000001',
            to: '+15550001111',
            voice: 'sulafat',
            startedAt: now,
            endedAt: now,
            durationSec: 30,
            endedBy: 'goodbye',
            flags: [],
            turns: [{ role: 'caller', text: 'Hello' }],
            gapsMs: [],
        },
    ]);
    await db.setVoiceGeminiKey(LEAVER, 'AIzaLeaverKey0000');
    await db.insertVoiceCalendarConnection(LEAVER, { provider: VoiceCalendarProvider.CAL_COM, connectedAccountId: 'ca_leaver' });
    await db.insertVoiceCampaign(LEAVER, { name: 'Leaver campaign', agentId: new ObjectId(agentId), numberId: new ObjectId(numberId) }, [
        { phone: '+919800000002' },
    ]);
    await db.insertVoiceCallerMemory(LEAVER, {
        agentId: new ObjectId(agentId),
        phone: '+919800000001',
        brief: 'Asked about prices.',
        lastCallId: new ObjectId(callId),
        lastCallAt: now,
    });
    const before = await db.countVoiceDocs(userId);
    expect(Object.values(before).filter((count) => count > 0).length).toBeGreaterThanOrEqual(5);

    await page.goto(`${MANAGE_TENANTS_PREFIX}${E2E_TENANT}`);
    const card = page.locator('[data-slot="card"]').filter({ hasText: LEAVER.email });
    await waitForHydration(page, '[data-slot="card"]');
    await card.hover();
    await card.getByRole('button', { name: `Delete ${LEAVER.name}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('User deleted successfully')).toBeVisible();

    expect(await db.countVoiceDocs(userId)).toEqual(Object.fromEntries(Object.keys(before).map((name) => [name, 0])));
});
