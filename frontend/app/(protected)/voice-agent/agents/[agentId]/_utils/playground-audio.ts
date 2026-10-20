/**
 * Browser audio for the playground socket (ported from `backend/voice/index.html`).
 *
 * - Up:   microphone -> 16 kHz mono Int16 LE, 20 ms binary frames.
 * - Down: binary frames of 24 kHz mono Int16 LE, played back-to-back on a scheduled queue.
 */

export const MIC_SAMPLE_RATE = 16_000;
export const SPEAKER_SAMPLE_RATE = 24_000;
export const MIC_WORKLET_NAME = 'aixel-playground-mic';

/** 20 ms at 16 kHz. */
const MIC_FRAME_SAMPLES = 320;

/**
 * Runs on the audio thread. Resamples whatever rate the context ended up at to 16 kHz (a copy when
 * the browser honoured `sampleRate: 16000`), packs Int16 LE and posts one frame plus its RMS level.
 */
const MIC_WORKLET_SOURCE = `
const TARGET_RATE = ${MIC_SAMPLE_RATE};
const FRAME = ${MIC_FRAME_SAMPLES};
class PlaygroundMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET_RATE;
    this.pos = 0;
    this.newFrame();
  }
  newFrame() {
    this.frame = new ArrayBuffer(FRAME * 2);
    this.view = new DataView(this.frame);
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      let s = a + (b - a) * frac;
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      this.view.setInt16(this.n * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      this.sum += s * s;
      this.n++;
      if (this.n === FRAME) {
        this.port.postMessage({ pcm: this.frame, rms: Math.sqrt(this.sum / FRAME) }, [this.frame]);
        this.newFrame();
      }
      this.pos += this.step;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor(${JSON.stringify(MIC_WORKLET_NAME)}, PlaygroundMic);
`;

export type MicFrame = { pcm: ArrayBuffer; rms: number };

function isMicFrame(data: unknown): data is MicFrame {
    return (
        typeof data === 'object' &&
        data !== null &&
        'pcm' in data &&
        data.pcm instanceof ArrayBuffer &&
        'rms' in data &&
        typeof data.rms === 'number'
    );
}

function newAudioContext(sampleRate: number): AudioContext {
    try {
        return new AudioContext({ sampleRate, latencyHint: 'interactive' });
    } catch {
        // A browser that cannot run at this rate: the worklet / buffers resample instead.
        return new AudioContext({ latencyHint: 'interactive' });
    }
}

/** Microphone capture. Call `start` from a click so the context is allowed to run. */
export class PlaygroundMic {
    private ctx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private node: AudioWorkletNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    /** Asks for the microphone and prepares the worklet; frames flow once `connect` is called. */
    async open(): Promise<void> {
        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.ctx = newAudioContext(MIC_SAMPLE_RATE);
        const url = URL.createObjectURL(new Blob([MIC_WORKLET_SOURCE], { type: 'application/javascript' }));
        try {
            await this.ctx.audioWorklet.addModule(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    connect(onFrame: (frame: MicFrame) => void): void {
        if (!this.ctx || !this.stream) throw new Error('Microphone is not open');
        this.source = this.ctx.createMediaStreamSource(this.stream);
        this.node = new AudioWorkletNode(this.ctx, MIC_WORKLET_NAME);
        this.node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
            if (isMicFrame(data)) onFrame(data);
        };
        // The worklet outputs silence; connecting it to the destination keeps it pulled.
        this.source.connect(this.node).connect(this.ctx.destination);
        void this.ctx.resume();
    }

    close(): void {
        if (this.node) this.node.port.onmessage = null;
        this.source?.disconnect();
        this.node?.disconnect();
        this.stream?.getTracks().forEach((track) => track.stop());
        void this.ctx?.close().catch(() => undefined);
        this.ctx = null;
        this.stream = null;
        this.node = null;
        this.source = null;
    }
}

/** Plays the agent's audio frames in order, and drops everything queued on `clear`. */
export class PlaygroundSpeaker {
    private ctx: AudioContext | null = null;
    private playHead = 0;
    private readonly sources = new Set<AudioBufferSourceNode>();

    /** `onPlayingChange` fires when her audio starts or stops coming out. */
    constructor(private readonly onPlayingChange: (playing: boolean) => void) {}

    open(): void {
        this.ctx = newAudioContext(SPEAKER_SAMPLE_RATE);
        void this.ctx.resume();
    }

    play(frame: ArrayBuffer): void {
        const ctx = this.ctx;
        const samples = Math.floor(frame.byteLength / 2);
        if (!ctx || samples === 0) return;

        const view = new DataView(frame);
        const buffer = ctx.createBuffer(1, samples, SPEAKER_SAMPLE_RATE);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 0x8000;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const now = ctx.currentTime;
        if (this.playHead < now) this.playHead = now + 0.02;
        source.start(this.playHead);
        this.playHead += buffer.duration;

        const wasPlaying = this.sources.size > 0;
        this.sources.add(source);
        source.onended = () => {
            this.sources.delete(source);
            if (this.sources.size === 0) this.onPlayingChange(false);
        };
        if (!wasPlaying) this.onPlayingChange(true);
    }

    clear(): void {
        const hadAudio = this.sources.size > 0;
        this.sources.forEach((source) => {
            source.onended = null;
            try {
                source.stop();
            } catch {
                // Already stopped.
            }
        });
        this.sources.clear();
        this.playHead = 0;
        if (hadAudio) this.onPlayingChange(false);
    }

    close(): void {
        this.clear();
        void this.ctx?.close().catch(() => undefined);
        this.ctx = null;
    }
}
