import { encryptOverrides } from 'flags';
import { ObjectId } from 'mongodb';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
    type VoiceCallDoc,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { expect, test } from '../support/fixtures';
import { E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';

const ANALYTICS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS];
const MINUTE = 60_000;

function call(agentId: string, minutesAgo: number, fields: Partial<VoiceCallDoc> = {}) {
    const startedAt = new Date(Date.now() - minutesAgo * MINUTE);
    return {
        agentId: new ObjectId(agentId),
        channel: VoiceCallChannel.PHONE,
        direction: VoiceCallDirection.OUTBOUND,
        from: '+13473703925',
        to: '+14155550123',
        voice: 'sulafat',
        startedAt,
        endedAt: new Date(startedAt.getTime() + 60_000),
        durationSec: 60,
        endedBy: 'goodbye',
        flags: [],
        turns: [
            { role: 'agent' as const, text: 'Hi, how can I help?' },
            { role: 'caller' as const, text: 'Just checking.' },
        ],
        gapsMs: [700],
        ...fields,
    };
}

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db, context }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    const flags = await encryptOverrides({ [FeatureFlagKey.VOICE_AGENT_ANALYTICS]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value: flags, url: E2E_BASE_URL }]);
});

test('counts current agents only, unless deleted agents are included; every cost part shows', async ({ page, db }) => {
    const salesId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales' });
    await db.insertVoiceCalls(E2E_USER, [
        call(salesId, 5, {
            cost: {
                totalUsd: 0.031,
                geminiUsd: 0.01,
                geminiFreeTier: false,
                geminiTokens: { textIn: 1000, audioIn: 100, textOut: 50, audioOut: 50 },
                provider: VoiceProvider.TELNYX,
                providerUsd: 0.02,
                providerExact: true,
                analysisUsd: 0.001,
            },
        }),
        // An agent deleted since: its call keeps the agent's id.
        call(new ObjectId().toString(), 10, { endedBy: 'no_answer', turns: [], gapsMs: [] }),
    ]);

    await page.goto(ANALYTICS_URL);
    await waitForHydration(page, '#header');
    const stats = page.getByTestId('analytics-stats');
    await expect(stats).toContainText('1 of 1 calls');
    await expect(page.getByText('Call analysis', { exact: true })).toBeVisible();

    await page.getByRole('switch', { name: 'Include deleted agents' }).click();
    await expect(page).toHaveURL(/[?&]deleted=1/);
    await expect(stats).toContainText('1 of 2 calls');
    await expect(stats).toContainText('50%');

    // One agent picked: the switch has nothing to add.
    await page.getByRole('combobox', { name: 'Agent' }).click();
    await page.getByRole('option', { name: 'Sales', exact: true }).click();
    await expect(stats).toContainText('1 of 1 calls');
    await expect(page.getByRole('switch', { name: 'Include deleted agents' })).toBeDisabled();
});
