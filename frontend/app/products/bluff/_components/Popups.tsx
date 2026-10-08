'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleHelp, Flag, ScrollText } from 'lucide-react';
import { BLUFF_RANKS, bluffRankName, type BluffRank } from '@aixellabs/backend/bluff/constants';
import type { BluffCard, BluffLogEntry, BluffPublicState } from '@aixellabs/backend/bluff/types';
import { cn } from '@/lib/utils';
import { Avatar, GButton, Ribbon } from '../../business/_components/bits';
import { cssVars } from '../../business/_lib/art';
import { sfx, sfxShared } from '../../business/_lib/sound';
import { PlayingCard, Pop } from './bits';

/** Opening a round: the cards you are putting down, and the rank you say they are. */
export function CallPopup({
    cards,
    closed,
    onPlay,
    onClose,
}: {
    cards: BluffCard[];
    closed: readonly BluffRank[];
    onPlay: (rank: BluffRank) => void;
    onClose: () => void;
}) {
    const [rank, setRank] = useState<BluffRank | null>(null);
    return (
        <Pop onClose={onClose}>
            <Ribbon>Your call</Ribbon>
            <div className="bl-picked">
                {cards.map((card) => (
                    <PlayingCard key={card.id} card={card} />
                ))}
            </div>
            <p className="small center">
                You open this round. What rank do you say {cards.length === 1 ? 'this is' : 'these are'}?
            </p>
            <div className="bl-ranks">
                {BLUFF_RANKS.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={cn('bl-rank', rank === r && 'on')}
                        disabled={closed.includes(r)}
                        aria-pressed={rank === r}
                        onClick={() => {
                            sfx('click');
                            setRank(r);
                        }}
                    >
                        {r}
                    </button>
                ))}
            </div>
            <GButton tone="green" size="big" disabled={!rank} onClick={() => rank && onPlay(rank)}>
                {rank ? `Play ${cards.length} ${bluffRankName(rank, cards.length)}` : 'Pick a rank'}
            </GButton>
            <GButton onClick={onClose}>Back</GButton>
            <p className="small center">
                {closed.length
                    ? `Closed: ${closed.join(', ')}. Four of each went to the trash.`
                    : 'Nobody sees the real cards unless someone calls Bluff.'}
            </p>
        </Pop>
    );
}

const RULES: [string, string][] = [
    ['Get rid of your cards', 'The first player with no cards wins.'],
    ['The opener names a rank', 'Put 1 to 4 cards face down and say a rank. You are allowed to lie.'],
    [
        'Play the same rank, or pass',
        'Everyone after adds cards as the same rank. If you pass, you sit out until the round ends.',
    ],
    ['Anyone can call Bluff', 'A lie? The liar takes the pile. The truth? The caller takes it.'],
    ['Nobody called?', 'The pile goes to the trash. Four cards trashed as one rank close that rank.'],
];

export function RulesPopup({ onClose }: { onClose: () => void }) {
    return (
        <Pop onClose={onClose}>
            <Ribbon>How to play</Ribbon>
            <div className="list">
                {RULES.map(([title, text]) => (
                    <div key={title} className="li guide">
                        <span>
                            <b>{title}</b>
                            <br />
                            {text}
                        </span>
                    </div>
                ))}
            </div>
            <GButton tone="gold" onClick={onClose}>
                Got it
            </GButton>
        </Pop>
    );
}

export function LogPopup({ log, onClose }: { log: BluffLogEntry[]; onClose: () => void }) {
    return (
        <Pop onClose={onClose}>
            <Ribbon>Activity</Ribbon>
            <ul className="log" style={{ maxHeight: '60dvh' }}>
                {log.map((entry) => (
                    <li key={entry.n}>{entry.text}</li>
                ))}
            </ul>
            <GButton tone="gold" onClick={onClose}>
                Close
            </GButton>
        </Pop>
    );
}

export function MenuPopup({
    playing,
    host,
    homeHref,
    onRules,
    onLog,
    onLeave,
    onEnd,
    onClose,
}: {
    /** Still in a running match: leaving gives the seat up. */
    playing: boolean;
    /** The host leaving ends the match for everyone. */
    host: boolean;
    homeHref: string;
    onRules: () => void;
    onLog: () => void;
    onLeave: () => void;
    /** Host only: end the match now for everyone. */
    onEnd?: () => void;
    onClose: () => void;
}) {
    const [confirm, setConfirm] = useState(false);
    const [ending, setEnding] = useState(false);
    return (
        <Pop onClose={onClose}>
            <Ribbon red={confirm}>{confirm ? 'Leave match' : 'Menu'}</Ribbon>
            {!confirm ? (
                <>
                    <div className="opts">
                        <GButton tone="blue" className="opt" onClick={onRules}>
                            <CircleHelp className="lu" />
                            How to play
                        </GButton>
                        <GButton tone="gold" className="opt" onClick={onLog}>
                            <ScrollText className="lu" />
                            Activity
                        </GButton>
                    </div>
                    <GButton tone="green" size="big" onClick={onClose}>
                        Keep playing
                    </GButton>
                    {onEnd && (
                        // Two taps, so the match is never ended by a slip of the thumb.
                        <GButton tone="orange" onClick={() => (ending ? onEnd() : setEnding(true))}>
                            <Flag className="lu" />
                            {ending ? 'Tap again: fewest cards wins now' : 'End match now'}
                        </GButton>
                    )}
                    {playing || host ? (
                        <GButton tone="red" onClick={() => setConfirm(true)}>
                            Exit to main menu
                        </GButton>
                    ) : (
                        <Link href={homeHref} className="gbtn red">
                            Exit to main menu
                        </Link>
                    )}
                </>
            ) : (
                <>
                    <p className="center" style={{ fontWeight: 800 }}>
                        {host
                            ? 'You are the host. If you leave, the match ends now for everyone and all players see the result.'
                            : 'Leaving ends your match. Your cards go to the trash and you take the last place.'}
                    </p>
                    <GButton tone="green" size="big" onClick={() => setConfirm(false)}>
                        Keep playing
                    </GButton>
                    <GButton tone="red" onClick={onLeave}>
                        {host ? 'End the match and leave' : 'Give up and leave'}
                    </GButton>
                </>
            )}
        </Pop>
    );
}

const CONFETTI_COLORS = ['#FFC83D', '#FF5568', '#49A6FF', '#34D27B', '#B57BFF', '#FFFFFF'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

/** Paper confetti raining over the whole screen. Positions are fixed per piece so it never reshuffles. */
function Confetti() {
    return (
        <div className="confetti" aria-hidden="true">
            {Array.from({ length: 60 }, (_, i) => (
                <i
                    key={i}
                    style={cssVars({
                        '--x': `${(i * 37) % 100}%`,
                        '--d': `${(i % 10) * 0.28}s`,
                        '--t': `${2.6 + (i % 5) * 0.45}s`,
                        '--r': `${(i * 53) % 360}deg`,
                        '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    })}
                />
            ))}
        </div>
    );
}

export function ResultPopup({ state, me, homeHref }: { state: BluffPublicState; me: number; homeHref: string }) {
    const ranking = state.ranking ?? [];
    const winner = state.players[ranking[0]?.seat ?? 0];
    const mine = ranking.find((r) => r.seat === me);
    const won = mine?.place === 1;
    const last = !!mine && mine.place === ranking.length && !mine.gone && ranking.length > 1;
    const podium = [ranking[1], ranking[0], ranking[2]];
    // Every window that can be seen plays it: the winner's fanfare, or a soft "aww" for everyone else.
    useEffect(() => sfxShared(won ? 'win' : 'lose'), [won]);
    return (
        <Pop>
            {won && <Confetti />}
            {won && <div className="rays" aria-hidden="true" />}
            <Ribbon red={last}>{last ? 'Caught out' : 'Winner'}</Ribbon>
            <div className="stackc" style={{ gap: 2 }}>
                <svg className="crown" viewBox="0 0 48 28" aria-hidden="true">
                    <path
                        d="M3 26 6 6l10 10 8-14 8 14 10-10 3 20z"
                        fill="#FFC83D"
                        stroke="#8A5200"
                        strokeWidth="2"
                        strokeLinejoin="round"
                    />
                </svg>
                <Avatar name={winner.name} color={winner.color} size="lg" />
                <h2 className="wintitle">{won ? 'You win!' : `${winner.name} wins!`}</h2>
                {!won && mine && (
                    <span className="tag dim">
                        {last ? 'You were left holding the cards' : `You finished ${ORDINALS[mine.place]}`}
                    </span>
                )}
            </div>
            <div className="podium">
                {podium.map((r, k) =>
                    r ? (
                        <div key={r.seat} className={`pod p${k === 1 ? 1 : k === 0 ? 2 : 3}`}>
                            <Avatar name={state.players[r.seat].name} color={state.players[r.seat].color} />
                            {state.players[r.seat].name}
                            <div className="blk">{k === 1 ? 1 : k === 0 ? 2 : 3}</div>
                        </div>
                    ) : (
                        <div key={`empty-${k}`} />
                    ),
                )}
            </div>
            <div className="list">
                {ranking.map((r) => (
                    <div key={r.seat} className="li">
                        <Avatar name={state.players[r.seat].name} color={state.players[r.seat].color} size="sm" />
                        {state.players[r.seat].name}
                        <span className="small">
                            {r.gone
                                ? 'Left the match'
                                : r.cards === 0
                                  ? `${ORDINALS[r.place]}: out of cards`
                                  : `Left with ${r.cards} card${r.cards === 1 ? '' : 's'}`}
                        </span>
                    </div>
                ))}
            </div>
            <p className="small center">
                {state.roundNo} rounds. {state.trash.count} cards ended in the trash.
            </p>
            <Link href={homeHref} className="gbtn green big">
                New room
            </Link>
        </Pop>
    );
}
