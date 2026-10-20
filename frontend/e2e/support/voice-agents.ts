import { expect, type Page, type WebSocketRoute } from '@playwright/test';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { E2E_VOICE_ENGINE_URL } from './env';

export const VOICE_AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

export function voiceAgentUrl(agentId: string): string {
    return `${VOICE_AGENTS_URL}/${agentId}`;
}

/** Waits until React owns the element, so clicks and typing are not lost to the server-rendered HTML. */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
    await expect(page.locator(selector).first()).toBeVisible();
    await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
    }, selector);
}

export async function openVoiceAgent(page: Page, agentId: string): Promise<void> {
    await page.goto(voiceAgentUrl(agentId));
    await waitForHydration(page, '#agent-prompt');
}

/** Chromium flags for a fake microphone (a looping test tone) with the permission already granted. */
export const FAKE_MIC_LAUNCH_ARGS = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
];

/**
 * Stands in for the voice engine's `/play` socket in the browser (nothing leaves the page).
 * Records what the page sends and lets the test push engine frames back.
 */
export class FakePlaygroundEngine {
    readonly urls: string[] = [];
    /** Byte length of every binary frame the page sent, with the time it arrived. */
    readonly audioFrames: { bytes: number; at: number }[] = [];
    readonly textFrames: string[] = [];
    closedByPage = false;
    private socket: WebSocketRoute | null = null;

    static async install(page: Page): Promise<FakePlaygroundEngine> {
        const engine = new FakePlaygroundEngine();
        const pattern = new RegExp(`^${E2E_VOICE_ENGINE_URL.replace(/^http/, 'ws').replace(/[.]/g, '\\.')}/play\\?`);
        await page.routeWebSocket(pattern, (ws) => {
            engine.socket = ws;
            engine.urls.push(ws.url());
            ws.onMessage((message) => {
                if (typeof message === 'string') engine.textFrames.push(message);
                else engine.audioFrames.push({ bytes: message.byteLength, at: Date.now() });
            });
            ws.onClose(() => {
                engine.closedByPage = true;
            });
        });
        return engine;
    }

    get connected(): boolean {
        return this.socket !== null;
    }

    private get ws(): WebSocketRoute {
        if (!this.socket) throw new Error('The page has not opened the playground socket');
        return this.socket;
    }

    sendEvent(event: Record<string, string | number>): void {
        this.ws.send(JSON.stringify(event));
    }

    /** Closes from the engine side, as it does to refuse a call (1008 / 1013 / 1011). */
    async close(code: number, reason: string): Promise<void> {
        await this.ws.close({ code, reason });
    }

    /** `seconds` of a quiet 24 kHz Int16 LE tone, in 100 ms frames, as the engine streams her voice. */
    sendAgentAudio(seconds: number): void {
        const frameSamples = 2400;
        for (let f = 0; f < Math.round(seconds * 10); f++) {
            const frame = Buffer.alloc(frameSamples * 2);
            for (let i = 0; i < frameSamples; i++) {
                frame.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / 24_000) * 2000), i * 2);
            }
            this.ws.send(frame);
        }
    }

    /** Bytes per second the page sent over the last `windowMs`. */
    async measureUpstreamRate(windowMs: number): Promise<number> {
        const from = Date.now();
        await new Promise((resolve) => setTimeout(resolve, windowMs));
        const to = Date.now();
        const bytes = this.audioFrames.filter((f) => f.at > from && f.at <= to).reduce((sum, f) => sum + f.bytes, 0);
        return (bytes * 1000) / (to - from);
    }
}
