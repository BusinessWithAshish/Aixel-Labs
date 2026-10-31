import { expect, type BrowserContext, type Locator, type Page, type WebSocketRoute } from '@playwright/test';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { E2E_VOICE_ENGINE_URL } from './env';

export const VOICE_AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

export function voiceAgentUrl(agentId: string): string {
    return `${VOICE_AGENTS_URL}/${agentId}`;
}

/**
 * Waits until React owns the element, so clicks and typing are not lost to the server-rendered HTML, and until no
 * streamed part of the page is still parked in a hidden `<div id="S:…">`: React 19.2 (Next 15.5) batches those swaps,
 * and until one lands a strict locator finds the page's controls twice.
 */
export async function waitForHydration(page: Page, selector: string): Promise<void> {
    await expect(page.locator(selector).first()).toBeVisible();
    await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return (
            !!el &&
            Object.keys(el).some((key) => key.startsWith('__reactProps')) &&
            !document.querySelector('div[hidden][id^="S:"]')
        );
    }, selector);
}

export async function openVoiceAgent(page: Page, agentId: string): Promise<void> {
    await page.goto(voiceAgentUrl(agentId));
    await waitForHydration(page, '#agent-prompt');
}

/** Opens one tool's settings in the editor's Tools list (one is open at a time) and returns its row. */
/** Opens a page's filter sheet (Call logs, Analytics) by its button's name, unless it is open; returns the sheet. */
export async function openFilters(page: Page, label: string): Promise<Locator> {
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    if (!(await sheet.isVisible())) await page.getByRole('button', { name: label }).click();
    await expect(sheet).toBeVisible();
    return sheet;
}

/** Closes the filter sheet with Done. */
export async function closeFilters(page: Page): Promise<void> {
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
}

export async function openVoiceTool(page: Page, name: string): Promise<Locator> {
    const row = page.getByTestId('voice-agent-tools').locator(`li[data-tool="${name}"]`);
    const trigger = row.locator('[data-slot="collapsible-trigger"]').first();
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    return row;
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

/** What the stand-in browser phone saw: `newCall` options, and the call on the line now. */
export type FakeRtcWindow = {
    e2eNewCalls: { destinationNumber: string; callerNumber?: string }[];
    /** Rings this browser, as Telnyx does when an agent dials its SIP URI. */
    e2eRing: () => void;
    /** Moves the call on the line to a state ("active", "hangup"…), as the far end does. */
    e2eSetState: (state: string) => void;
};

/**
 * Stands in for `@telnyx/webrtc` (`window.__e2eTelnyxRTC`, see helpers/voice-browser-call.ts) and grants the
 * microphone: nothing leaves the page. Signs in at once; calls placed ring; `e2eRing` rings this browser.
 */
export async function installFakeTelnyxRtc(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        type Handler = (payload?: unknown) => void;
        const w = window as unknown as Record<string, unknown>;
        let current: FakeCall | null = null;
        class FakeCall {
            id = String(Math.random());
            state = 'new';
            constructor(
                private client: FakeTelnyxRTC,
                readonly direction: string,
            ) {}
            emit(state: string) {
                this.state = state;
                this.client.fire('telnyx.notification', { type: 'callUpdate', call: this });
            }
            answer() {
                this.emit('active');
                return Promise.resolve();
            }
            hangup() {
                this.emit('hangup');
            }
            muteAudio() {}
            unmuteAudio() {}
            dtmf() {}
        }
        class FakeTelnyxRTC {
            handlers: Record<string, Handler[]> = {};
            remoteElement: unknown = null;
            on(event: string, handler: Handler) {
                (this.handlers[event] ??= []).push(handler);
                return this;
            }
            fire(event: string, payload?: unknown) {
                (this.handlers[event] ?? []).forEach((h) => h(payload));
            }
            connect() {
                w.e2eClient = this;
                setTimeout(() => this.fire('telnyx.ready'), 0);
                return Promise.resolve();
            }
            disconnect() {
                return Promise.resolve();
            }
            newCall(options: { destinationNumber: string; callerNumber?: string }) {
                (w.e2eNewCalls as unknown[]).push({
                    destinationNumber: options.destinationNumber,
                    callerNumber: options.callerNumber,
                });
                current = new FakeCall(this, 'outbound');
                const call = current;
                setTimeout(() => call.emit('ringing'), 0);
                return call;
            }
        }
        w.e2eNewCalls = [];
        w.__e2eTelnyxRTC = FakeTelnyxRTC;
        w.e2eRing = () => {
            current = new FakeCall(w.e2eClient as FakeTelnyxRTC, 'inbound');
            current.emit('ringing');
        };
        w.e2eSetState = (state: string) => current?.emit(state);
        navigator.mediaDevices.getUserMedia = () => Promise.resolve(new MediaStream());
    });
}
