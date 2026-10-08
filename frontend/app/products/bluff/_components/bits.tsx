'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Lightbulb } from 'lucide-react';
import type { BluffCard } from '@aixellabs/backend/bluff/types';
import { cn } from '@/lib/utils';
import { sfx } from '../../business/_lib/sound';

/** Text glyphs, never emoji: the variation selector keeps them flat and tintable. */
const SUIT = { s: '♠︎', h: '♥︎', d: '♦︎', c: '♣︎' } as const;
const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const;

/** A card, face up. A button when `onClick` is given (a card in your hand), plain otherwise. */
export function PlayingCard({ card, selected, onClick }: { card: BluffCard; selected?: boolean; onClick?: () => void }) {
    const className = cn('bl-card', (card.suit === 'h' || card.suit === 'd') && 'red', selected && 'sel');
    const inner = (
        <>
            <b>{card.rank}</b>
            <i>{SUIT[card.suit]}</i>
            <em>{SUIT[card.suit]}</em>
        </>
    );
    const label = `${card.rank} of ${SUIT_NAME[card.suit]}`;
    return onClick ? (
        <button type="button" className={className} aria-label={label} aria-pressed={!!selected} onClick={onClick}>
            {inner}
        </button>
    ) : (
        <span className={className} role="img" aria-label={label}>
            {inner}
        </span>
    );
}

/** The game's wordmark: the four suits over the name. Sizes with its font-size. */
export function BluffLogo() {
    return (
        <div className="logo bl-logo">
            <span className="bl-pips" aria-hidden="true">
                {SUIT.s} <i>{SUIT.h}</i> {SUIT.c} <i>{SUIT.d}</i>
            </span>
            <span>Bluff</span>
        </div>
    );
}

/**
 * A pop-up over the whole screen, the same one as Big Business with the button worded for a
 * card table. `onClose` makes a tap outside the card dismiss it.
 */
export function Pop({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
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
                {peek ? 'Back to pop-up' : 'View table'}
            </button>
            <div className="pop-card">{children}</div>
        </div>
    );
}

export const secondsLabel = (s: number) => `${s} sec`;
export const END_MODES = [0, 1] as const;
export const endLabel = (value: number) => (value === 1 ? 'First out wins' : 'Last player');

const TIPS = [
    'The first player with no cards wins.',
    'Put cards face down and say a rank. You are allowed to lie.',
    'Anyone can call Bluff, at any time, on the last cards played.',
    'Call a lie and the liar takes the pile. Call the truth and you take it.',
    'If you pass, you sit out until the round ends. You can still call Bluff.',
    'Nobody called? The pile goes to the trash.',
    'Four cards trashed as one rank close that rank for the rest of the match.',
    'Stuck with a closed rank? Slip those cards out as something else.',
    'Miss too many turns in a row and you are out.',
];
const TIP_MS = 4500;

/** A rotating game tip, in place of fine print. */
export function BluffTips() {
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
