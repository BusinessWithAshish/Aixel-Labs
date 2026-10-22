import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    FAKE_MIC_LAUNCH_ARGS,
    FakePlaygroundEngine,
    openVoiceAgent,
    VOICE_AGENTS_URL,
    waitForHydration,
} from '../support/voice-agents';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { DEFAULT_INBOUND_VOICE_AGENT_PROMPT, DEFAULT_VOICE_AGENT_PROMPT } from '@/helpers/voice-agent-defaults';

/**
 * Not a pass/fail suite: screenshots of the voice agents list, editor and a playground call
 * (against a stand-in engine socket), plus horizontal-overflow findings in `report.json`.
 */
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};

test.use({
    storageState: USER_STORAGE_STATE,
    permissions: ['microphone'],
    launchOptions: { args: FAKE_MIC_LAUNCH_ARGS },
});

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test('voice agents walkthrough', async ({ page, db }) => {
            test.setTimeout(5 * 60_000);
            await db.resetUser(E2E_USER);
            await db.resetVoiceAgents(E2E_USER);
            await db.resetVoiceTelephony(E2E_USER);

            const outDir = path.join(E2E_ARTIFACTS_DIR, 'walkthrough', 'voice-agents', viewportName);
            await mkdir(outDir, { recursive: true });
            const findings: { screen: string; detail: string }[] = [];
            let shot = 0;
            const capture = async (name: string, fullPage = true) => {
                await page.waitForTimeout(400);
                const overflow = await page.evaluate(
                    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
                if (overflow > 1) findings.push({ screen: name, detail: `${overflow}px wider than the viewport` });
                shot += 1;
                await page.screenshot({ path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage });
            };

            await page.goto(VOICE_AGENTS_URL);
            await waitForHydration(page, '[data-testid="new-voice-agent"]');
            await capture('list-empty');

            await page.getByTestId('new-voice-agent').click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await capture('create-dialog-type', false);
            await page.getByRole('dialog').getByRole('combobox', { name: 'Call type' }).click();
            await page.getByRole('option', { name: /^Inbound/ }).click();
            await expect(page.getByRole('dialog').getByLabel('Name')).toBeVisible();
            await capture('create-dialog-details', false);
            await page.keyboard.press('Escape');

            const agentId = await db.insertVoiceAgent(E2E_USER, {
                name: 'Maya',
                callType: VoiceAgentCallType.OUTBOUND,
                prompt: DEFAULT_VOICE_AGENT_PROMPT,
            });
            const frontDesk = await db.insertVoiceAgent(E2E_USER, {
                name: 'Front desk (after hours)',
                callType: VoiceAgentCallType.INBOUND,
                voice: 'kore',
                prompt: DEFAULT_INBOUND_VOICE_AGENT_PROMPT,
            });
            await db.insertVoiceAgent(E2E_USER, { name: 'Dental clinic follow-up', voice: 'puck' });
            const main = await db.insertVoiceNumber(E2E_USER, {
                phoneNumber: '+13475550142',
                providerNumberId: 'pn-walkthrough-1',
                apiKeySealed: 'not-a-real-key',
            });
            const second = await db.insertVoiceNumber(E2E_USER, {
                phoneNumber: '+13475550188',
                providerNumberId: 'pn-walkthrough-2',
                apiKeySealed: 'not-a-real-key',
            });
            await db.setVoiceNumberAgents(main, { inboundAgentId: frontDesk, outboundAgentId: agentId });
            await db.setVoiceNumberAgents(second, { outboundAgentId: agentId });
            await page.goto(VOICE_AGENTS_URL);
            await expect(page.getByTestId('voice-agent-card')).toHaveCount(3);
            await capture('list');

            await openVoiceAgent(page, frontDesk);
            await capture('editor-inbound');
            await page.getByTestId('agent-numbers').scrollIntoViewIfNeeded();
            await capture('editor-numbers', false);

            const engine = await FakePlaygroundEngine.install(page);
            await openVoiceAgent(page, agentId);
            await capture('editor');

            await page.locator('#agent-name').fill('Maya (demo calls)');
            await capture('editor-unsaved', false);

            await page.getByRole('button', { name: 'Save and start call' }).click();
            await expect(page.getByTestId('playground-status')).toHaveText('Live');
            await expect.poll(() => engine.connected).toBe(true);
            sendSampleCall(engine);
            engine.sendAgentAudio(4);
            await expect(page.getByTestId('agent-speaking')).toHaveAttribute('data-speaking', 'true');
            await page.getByTestId('voice-playground').scrollIntoViewIfNeeded();
            await capture('playground-live', false);

            engine.sendEvent({ type: 'ended', reason: 'goodbye' });
            await expect(page.getByTestId('playground-ended')).toBeVisible();
            await capture('playground-ended');

            await writeFile(path.join(outDir, 'report.json'), JSON.stringify(findings, null, 2));
        });
    });
}

function sendSampleCall(engine: FakePlaygroundEngine): void {
    const lines: [string, string][] = [
        [
            'agent',
            'Hi, quick one. I was looking for your website to see if people can book online and could not find it. Do you have one?',
        ],
        ['caller', 'No, we just take calls.'],
        ['agent', 'So people book only by phoning you?'],
        ['caller', 'Yeah, mostly.'],
        [
            'agent',
            "That's actually why I called. I'm Maya, from Aixel Labs. I've already built a demo of a site that takes bookings by itself.",
        ],
    ];
    lines.forEach(([role, text], i) => {
        if (role === 'agent' && i > 0) engine.sendEvent({ type: 'turn', gapMs: 560 + i * 37 });
        engine.sendEvent({ type: 'transcript', role, text });
    });
}
