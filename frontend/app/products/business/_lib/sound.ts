import { loadMusicOn, loadMuted, saveMusicOn, saveMuted } from './client';

/**
 * Synthesised sound effects and a soft background loop (no audio files).
 * Browsers only allow audio after a tap, so nothing plays before the first one.
 */
let ctx: AudioContext | null = null;
let muted: boolean | null = null;
let musicOn: boolean | null = null;
let musicGain: GainNode | null = null;
let musicTimer: number | undefined;
let nextBeat = 0;
let beat = 0;

function audio(): AudioContext | null {
    try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = ctx ?? new Ctor();
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

export function isMuted(): boolean {
    if (muted === null) muted = loadMuted();
    return muted;
}

export function setMuted(next: boolean) {
    muted = next;
    saveMuted(next);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, out?: AudioNode) {
    const ac = audio();
    if (!ac) return;
    try {
        const t = Math.max(ac.currentTime, when);
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain);
        gain.connect(out ?? ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    } catch {
        /* audio is a nicety; never break the game over it */
    }
}

/** One effect note, `delay` seconds from now. */
function fx(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
    if (isMuted()) return;
    const ac = audio();
    if (ac) tone(freq, dur, type, vol, ac.currentTime + delay, slideTo);
}

const SOUNDS = {
    click: () => fx(520, 0.05, 'square', 0.04),
    /** A rattle that lasts as long as the dice tumble. */
    dice: () => {
        for (let i = 0; i < 9; i++) fx(170 + Math.random() * 260, 0.045, 'square', 0.05, i * 0.1);
    },
    step: () => fx(620, 0.07, 'triangle', 0.1, 0, 900),
    /** A bright two-note coin chime with a sparkle on top. */
    buy: () => {
        fx(988, 0.08, 'square', 0.045);
        fx(1319, 0.42, 'square', 0.045, 0.08);
        fx(1976, 0.36, 'sine', 0.06, 0.1);
        fx(2637, 0.28, 'sine', 0.035, 0.18);
        fx(330, 0.18, 'triangle', 0.1);
    },
    /** Cash coming in: rent, salary, a lucky card. */
    income: () => {
        fx(1175, 0.07, 'sine', 0.12);
        fx(1568, 0.07, 'sine', 0.12, 0.07);
        fx(2093, 0.16, 'sine', 0.1, 0.14);
    },
    pay: () => fx(330, 0.24, 'sawtooth', 0.06, 0, 150),
    /** Rent changing hands: a run of coins dropping from one purse into another. */
    rent: () => {
        [1568, 1397, 1319, 1175, 1047].forEach((f, i) => fx(f, 0.09, 'triangle', 0.09, i * 0.06));
        fx(2093, 0.3, 'sine', 0.07, 0.32);
    },
    /** A loan or a player mortgage: a cash-register "ka-ching". */
    loan: () => {
        fx(180, 0.06, 'square', 0.08);
        fx(140, 0.06, 'square', 0.08, 0.06);
        fx(2349, 0.5, 'sine', 0.09, 0.13);
        fx(3136, 0.4, 'sine', 0.05, 0.13);
    },
    /** Salary at Launch: a short rising fanfare of coins. */
    salary: () => {
        [784, 988, 1175, 1568].forEach((f, i) => fx(f, 0.12, 'square', 0.035, i * 0.07));
        fx(2093, 0.35, 'sine', 0.08, 0.3);
    },
    /** You won: a long victory fanfare, about three seconds, with a drum roll into it. */
    win: () => {
        for (let i = 0; i < 10; i++) fx(140 + (i % 2) * 20, 0.06, 'square', 0.04, i * 0.07);
        const tune: [number, number][] = [
            [523, 0.15], [523, 0.15], [523, 0.15], [523, 0.45], [415, 0.45], [466, 0.45], [523, 0.3], [466, 0.15], [523, 1.1],
        ];
        let t = 0.75;
        for (const [f, d] of tune) {
            fx(f, d * 0.95, 'square', 0.05, t);
            fx(f / 2, d * 0.95, 'triangle', 0.09, t);
            t += d;
        }
        [1047, 1319, 1568, 2093].forEach((f, i) => fx(f, 0.6, 'sine', 0.05, t - 1 + i * 0.08));
    },
    /** The match ended and someone else won: a gentle, falling "aww". */
    lose: () => {
        [523, 494, 466, 440].forEach((f, i) => fx(f, i === 3 ? 0.9 : 0.32, 'triangle', 0.1, i * 0.34, i === 3 ? 400 : undefined));
    },
    /** A few minutes left on the match clock. */
    chime: () => {
        fx(1319, 0.5, 'sine', 0.1);
        fx(988, 0.7, 'sine', 0.1, 0.25);
    },
    /** Three doubles in a row: a speed camera flash. */
    speeding: () => {
        fx(1800, 0.05, 'square', 0.05);
        fx(1800, 0.05, 'square', 0.05, 0.1);
        fx(1800, 0.05, 'square', 0.05, 0.2);
        fx(220, 0.5, 'sawtooth', 0.07, 0.32, 110);
    },
    /** The host started the match. */
    start: () => {
        [392, 523, 659].forEach((f, i) => fx(f, 0.16, 'square', 0.05, i * 0.13));
        fx(784, 0.55, 'square', 0.05, 0.39);
        fx(1047, 0.55, 'triangle', 0.08, 0.39);
        fx(196, 0.8, 'triangle', 0.12, 0.39);
    },
    card: () => fx(950, 0.14, 'sine', 0.08, 0, 420),
    jail: () => fx(150, 0.45, 'sawtooth', 0.08, 0, 70),
    bid: () => fx(1250, 0.05, 'square', 0.04),
    /** Someone else's turn begins. */
    turn: () => fx(440, 0.12, 'triangle', 0.07),
    /** Your own turn begins. */
    myTurn: () => {
        fx(523, 0.1, 'triangle', 0.12);
        fx(659, 0.1, 'triangle', 0.12, 0.1);
        fx(784, 0.2, 'triangle', 0.12, 0.2);
    },
    /** A debt has been cleared. */
    paidOff: () => {
        [523, 659, 784, 1047].forEach((f, i) => fx(f, 0.16, 'triangle', 0.12, i * 0.1));
        fx(1319, 0.35, 'sine', 0.1, 0.42);
    },
    /** The last five seconds of a decision. */
    tick: () => fx(1100, 0.035, 'square', 0.07),
    /** The timer ran out. */
    timeout: () => {
        fx(300, 0.18, 'square', 0.07);
        fx(220, 0.4, 'square', 0.07, 0.2);
    },
    /** Police siren, for the trip to Jail. */
    siren: () => {
        for (let i = 0; i < 6; i++) fx(i % 2 ? 620 : 880, 0.24, 'sawtooth', 0.045, i * 0.24, i % 2 ? 880 : 620);
    },
    out: () => {
        fx(392, 0.2, 'sawtooth', 0.07);
        fx(294, 0.2, 'sawtooth', 0.07, 0.2);
        fx(196, 0.5, 'sawtooth', 0.07, 0.4);
    },
} as const;

export type BusinessSound = keyof typeof SOUNDS;

/**
 * Only the window in focus makes sound, so several game windows open on one
 * computer do not all play the same effect at once. "Your turn" always plays.
 */
function audible(name: BusinessSound): boolean {
    return name === 'myTurn' || typeof document === 'undefined' || document.hasFocus();
}

export function sfx(name: BusinessSound) {
    if (audible(name)) SOUNDS[name]();
}

/**
 * For timer ticks and the timeout buzzer: every window that can be seen plays
 * them, focused or not. They are scheduled on the server clock, so several
 * windows tick at the same moment and sound as one.
 */
export function sfxShared(name: BusinessSound) {
    if (typeof document !== 'undefined' && document.hidden) return;
    SOUNDS[name]();
}

const QUEUE_GAP_MS = 300;
let queueFreeAt = 0;

/**
 * Plays after any effect already queued has had its moment, so the sounds of
 * one landing (rent, a card, the next turn) come one after another, not on top
 * of each other.
 */
export function sfxQueued(name: BusinessSound) {
    if (!audible(name)) return;
    const now = performance.now();
    const at = Math.max(now, queueFreeAt);
    queueFreeAt = at + QUEUE_GAP_MS;
    window.setTimeout(() => SOUNDS[name](), at - now);
}

/* ---------- background music ---------- */

const BEAT_SECONDS = 0.34;
/** Four bars, eight beats each: root note of the bar, then a gentle arpeggio over it. */
const BARS = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
];
const PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];

function schedule() {
    const ac = audio();
    if (!ac || !musicGain) return;
    while (nextBeat < ac.currentTime + 0.6) {
        const bar = BARS[Math.floor(beat / PATTERN.length) % BARS.length];
        const step = beat % PATTERN.length;
        tone(bar[PATTERN[step]] * 2, BEAT_SECONDS * 1.6, 'triangle', 0.5, nextBeat, undefined, musicGain);
        if (step === 0) tone(bar[0] / 2, BEAT_SECONDS * 7, 'sine', 0.9, nextBeat, undefined, musicGain);
        nextBeat += BEAT_SECONDS;
        beat++;
    }
}

export function isMusicOn(): boolean {
    if (musicOn === null) musicOn = loadMusicOn();
    return musicOn;
}

/** Starts the loop if music is switched on. Safe to call on every tap. */
export function startMusic() {
    if (!isMusicOn()) return;
    // Always try to wake the audio: a loop scheduled before the first tap is silent until then.
    const ac = audio();
    if (!ac || musicTimer !== undefined) return;
    musicGain = ac.createGain();
    musicGain.gain.value = 0.045;
    musicGain.connect(ac.destination);
    nextBeat = ac.currentTime + 0.1;
    schedule();
    musicTimer = window.setInterval(schedule, 200);
}

export function stopMusic() {
    window.clearInterval(musicTimer);
    musicTimer = undefined;
    musicGain?.disconnect();
    musicGain = null;
}

export function setMusicOn(next: boolean) {
    musicOn = next;
    saveMusicOn(next);
    if (next) startMusic();
    else stopMusic();
}

/**
 * Browsers keep a page silent until the player first taps or types. Listens
 * for that first touch anywhere on the page and starts the music there, so it
 * never needs a toggle off and on. Returns a cleanup.
 */
export function installAudioUnlock(): () => void {
    const events = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
    // Every tap wakes the audio, music or not: a context first made by a timer
    // (a tick in another player's turn) stays silent until the page is touched.
    const unlock = () => {
        audio();
        startMusic();
    };
    events.forEach((e) => document.addEventListener(e, unlock, true));
    startMusic();
    return () => events.forEach((e) => document.removeEventListener(e, unlock, true));
}
