'use client';

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff, IndianRupee, Lightbulb, Maximize, Minimize, Music, Volume2, VolumeX } from 'lucide-react';
import { BUSINESS_RULES } from '@aixellabs/backend/business/constants';
import { cn } from '@/lib/utils';
import { cssVars } from '../_lib/art';
import { fmt, rs } from '../_lib/client';
import { isMusicOn, isMuted, setMusicOn, setMuted, sfx, startMusic } from '../_lib/sound';
import { notify } from '../_lib/toast';

type GButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'violet' | 'green' | 'red' | 'blue' | 'orange' | 'gold';
    size?: 'sm' | 'md' | 'big';
};

/** Chunky game button: click sound plus a press-and-bounce on every tap. */
export function GButton({ tone = 'violet', size = 'md', className, onClick, children, ...rest }: GButtonProps) {
    return (
        <button
            type="button"
            className={cn('gbtn', tone !== 'violet' && tone, size !== 'md' && size, className)}
            onClick={(event) => {
                sfx('click');
                startMusic();
                const el = event.currentTarget;
                el.classList.remove('bump');
                void el.offsetWidth;
                el.classList.add('bump');
                onClick?.(event);
            }}
            {...rest}
        >
            {children}
        </button>
    );
}

export function Cash({ value, className }: { value: number; className?: string }) {
    return (
        <span className={cn('cash', className)}>
            <IndianRupee className="lu" />
            {fmt(value)}
        </span>
    );
}

export function Avatar({ name, color, size }: { name: string; color: string; size?: 'sm' | 'lg' }) {
    return (
        <span className={cn('av', size)} style={cssVars({ '--c': color })}>
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

export function Ribbon({ children, red }: { children: ReactNode; red?: boolean }) {
    return <span className={cn('rib', red && 'red')}>{children}</span>;
}

/**
 * A pop-up over the whole screen. `onClose` makes a tap outside the card
 * dismiss it. `bare` drops the purple card so the content brings its own frame.
 * Every pop-up carries a "View board" button that tucks it away to look at
 * the table, and brings it back on the next tap.
 */
export function Pop({ children, onClose, bare }: { children: ReactNode; onClose?: () => void; bare?: boolean }) {
    const [peek, setPeek] = useState(false);
    return (
        <div
            className={cn('pop', peek && 'peek')}
            onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (peek) setPeek(false);
                else onClose?.();
            }}
        >
            <button
                type="button"
                className={cn('gbtn sm peekbtn', peek ? 'gold' : 'blue')}
                onClick={() => {
                    sfx('click');
                    setPeek(!peek);
                }}
            >
                {peek ? <EyeOff className="lu" /> : <Eye className="lu" />}
                {peek ? 'Back to pop-up' : 'View board'}
            </button>
            <div className={cn('pop-card', bare && 'bare')}>
                {children}
                {onClose && bare && <span className="hint">Tap outside to close</span>}
            </div>
        </div>
    );
}

/** The game's wordmark: a jewelled crown over the name. Sizes with its font-size. */
export function Logo({ className }: { className?: string }) {
    return (
        <div className={cn('logo', className)}>
            <svg className="crown" viewBox="0 0 64 44" aria-hidden="true">
                <defs>
                    <linearGradient id="bb-crown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#FFE98A" />
                        <stop offset="1" stopColor="#F0A416" />
                    </linearGradient>
                </defs>
                <path d="M7 33 4 12l14 10L32 4l14 18 14-10-3 21z" fill="url(#bb-crown)" stroke="#8A5200" strokeWidth="2.6" strokeLinejoin="round" />
                <rect x="6" y="33" width="52" height="8" rx="3" fill="url(#bb-crown)" stroke="#8A5200" strokeWidth="2.6" />
                <circle cx="4" cy="11" r="3.4" fill="#FF5568" stroke="#8A5200" strokeWidth="1.6" />
                <circle cx="32" cy="4.5" r="3.8" fill="#49A6FF" stroke="#8A5200" strokeWidth="1.6" />
                <circle cx="60" cy="11" r="3.4" fill="#34D27B" stroke="#8A5200" strokeWidth="1.6" />
                <circle cx="20" cy="37" r="1.9" fill="#FF5568" />
                <circle cx="32" cy="37" r="1.9" fill="#49A6FF" />
                <circle cx="44" cy="37" r="1.9" fill="#34D27B" />
            </svg>
            <span>Big</span>
            <span>Business</span>
        </div>
    );
}

/**
 * Full screen on and off. Shown only where the browser can do it for a page
 * (iPhone Safari cannot), so the button never sits there doing nothing.
 */
export function FullscreenToggle() {
    const [can, setCan] = useState(false);
    const [full, setFull] = useState(false);
    useEffect(() => {
        setCan(document.fullscreenEnabled === true);
        const sync = () => setFull(document.fullscreenElement !== null);
        sync();
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);
    if (!can) return null;
    return (
        <button
            type="button"
            className="ib"
            aria-label={full ? 'Leave full screen' : 'Play in full screen'}
            onClick={() => {
                const done = full ? document.exitFullscreen() : document.documentElement.requestFullscreen();
                done.catch(() => notify('Full screen is not available here.', 'error'));
            }}
        >
            {full ? <Minimize className="lu" /> : <Maximize className="lu" />}
        </button>
    );
}

/** Sound-effects and music switches (and full screen), shown on every screen. */
export function AudioToggles() {
    const [muted, setMutedState] = useState(false);
    const [music, setMusicState] = useState(false);
    useEffect(() => {
        setMutedState(isMuted());
        setMusicState(isMusicOn());
    }, []);
    return (
        <>
            <FullscreenToggle />
            <button
                type="button"
                className={cn('ib', muted && 'offc')}
                aria-label={muted ? 'Turn sound effects on' : 'Turn sound effects off'}
                onClick={() => {
                    setMuted(!muted);
                    setMutedState(!muted);
                    if (muted) sfx('income');
                    notify(muted ? 'Sound effects on' : 'Sound effects off');
                }}
            >
                {muted ? <VolumeX className="lu" /> : <Volume2 className="lu" />}
            </button>
            <button
                type="button"
                className={cn('ib', !music && 'offc')}
                aria-label={music ? 'Turn music off' : 'Turn music on'}
                onClick={() => {
                    setMusicOn(!music);
                    setMusicState(!music);
                    notify(music ? 'Music off' : 'Music on');
                }}
            >
                <Music className="lu" />
            </button>
        </>
    );
}

export function Slider({
    label,
    value,
    display,
    min,
    max,
    step,
    onChange,
}: {
    label: string;
    value: number;
    display: ReactNode;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="sl">
            <span>
                {label} <b>{display}</b>
            </span>
            <input
                type="range"
                min={min}
                max={Math.max(min, max)}
                step={step}
                value={Math.min(value, Math.max(min, max))}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </label>
    );
}

/** A row of choices where exactly one is lit, e.g. match length. */
export function Choices<T extends number>({
    options,
    value,
    label,
    onPick,
    locked,
}: {
    options: readonly T[];
    value: T;
    label: (option: T) => string;
    onPick: (option: T) => void;
    /** Shown but not changeable (a guest looking at the host's settings). */
    locked?: boolean;
}) {
    return (
        <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
            {options.map((option) => (
                <GButton
                    key={option}
                    size="sm"
                    tone="gold"
                    className={option === value ? undefined : 'off'}
                    disabled={locked && option !== value}
                    onClick={() => !locked && onPick(option)}
                >
                    {label(option)}
                </GButton>
            ))}
        </div>
    );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
    return (
        <span className="stepper">
            <GButton size="sm" disabled={value <= min} onClick={() => onChange(value - 1)}>
                −
            </GButton>
            <b>{value}</b>
            <GButton size="sm" disabled={value >= max} onClick={() => onChange(value + 1)}>
                +
            </GButton>
        </span>
    );
}

export const minutesLabel = (m: number) => (m === 0 ? 'No limit' : m === 60 ? '1 hour' : `${m} min`);
export const missLabel = (n: number) => `${n} turns`;

const TIPS = [
    `Your salary at Launch grows by ${rs(BUSINESS_RULES.SALARY_STEP)} with every lap you complete.`,
    'Railway rent climbs with every house built on the board.',
    'Taxes take a share of the cash you hold.',
    'Own a full colour set and rent there triples.',
    'Short of cash? Mortgage a property, or ask a player for a loan.',
    `Market: roll ${BUSINESS_RULES.MARKET_FLAT_MAX + 1} to 12 and your stake doubles.`,
    'Roll doubles in Jail to walk out free.',
    'Tap any property on the board to see its rents.',
    'Loans and trades stay private between the two players.',
    'Miss too many turns in a row and you are out.',
    'Colours are dealt at random when the match starts.',
];
const TIP_MS = 4500;

/** A rotating game tip, in place of fine print. */
export function Tips() {
    const [i, setI] = useState(0);
    useEffect(() => {
        setI(Math.floor(Math.random() * TIPS.length));
        const timer = window.setInterval(() => setI((n) => (n + 1) % TIPS.length), TIP_MS);
        return () => window.clearInterval(timer);
    }, []);
    return (
        <p className="tips" aria-live="off">
            <Lightbulb className="lu" />
            <span key={i}>{TIPS[i]}</span>
        </p>
    );
}
