'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Bot, CheckCheck, Mic, Phone, SendHorizontal, Trash2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A WhatsApp-looking chat: the green header, the patterned wallpaper, white bubbles for the person on the left,
 * green ones for the business on the right with the time and blue ticks, voice notes as a waveform. Used by the
 * WhatsApp inbox and the agent's test chat, so both look like the chat the customer sees on their phone.
 * The colours are WhatsApp's own (light and dark), on purpose: these screens stand for a WhatsApp chat.
 */

/** A turn's WhatsApp side: the person writes on the left, the business (its AI or a person) on the right. */
export type WhatsAppSide = 'in' | 'out';

export function whatsappTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Yesterday", or the date, as WhatsApp heads each day. */
export function whatsappDay(iso: string): string {
    const day = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (day.toDateString() === today.toDateString()) return 'Today';
    if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function initials(name: string): string {
    const words = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

type WhatsAppFrameProps = {
    title: string;
    subtitle?: ReactNode;
    /** Right side of the header (status, buttons). */
    actions?: ReactNode;
    /** Under the messages, above the composer (a takeover bar, a notice). */
    banner?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    /** Changes when a message arrives (e.g. the chat's id and message count): the window scrolls to the latest then, and only then. */
    scrollKey?: string | number;
    className?: string;
};

/** The chat window: header, wallpaper with the messages (scrolled to the latest as one arrives), then banner and footer. */
export function WhatsAppFrame({ title, subtitle, actions, banner, footer, children, scrollKey, className }: WhatsAppFrameProps) {
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // After layout, so bubbles that grew (fonts, wrapping) are counted.
        const frame = requestAnimationFrame(() => {
            const el = scroller.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
        return () => cancelAnimationFrame(frame);
    }, [scrollKey]);

    return (
        <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border', className)} aria-label={`Chat with ${title}`}>
            <header className="flex items-center gap-3 bg-[#008069] px-4 py-2.5 text-white dark:bg-[#202c33]">
                <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]"
                >
                    {initials(title)}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{title}</p>
                    {subtitle ? <div className="truncate text-xs text-white/80">{subtitle}</div> : null}
                </div>
                {actions}
            </header>
            <div
                ref={scroller}
                role="log"
                aria-live="polite"
                className={cn(
                    'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-[6%] py-4',
                    'bg-[#efeae2] [background-image:radial-gradient(rgba(0,0,0,0.045)_1px,transparent_1px)] [background-size:18px_18px]',
                    'dark:bg-[#0b141a] dark:[background-image:radial-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)]',
                )}
            >
                {children}
            </div>
            {banner}
            {footer}
        </section>
    );
}

/** A centred pill: a day ("Today"), or a note about the chat. */
export function WhatsAppPill({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className="my-2 flex justify-center">
            <span
                className={cn(
                    'rounded-lg bg-white/90 px-3 py-1 text-center text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]',
                    className,
                )}
            >
                {children}
            </span>
        </div>
    );
}

/** A fixed-looking waveform: bars of varying height (the audio itself stays with WhatsApp). */
function Waveform() {
    const bars = [4, 9, 6, 12, 7, 14, 5, 10, 13, 6, 9, 4, 11, 7, 12, 5, 8, 10, 6, 4, 9, 12, 7, 5];
    return (
        <span aria-hidden className="flex h-5 items-center gap-[2px]">
            {bars.map((h, i) => (
                <span key={i} className="w-[3px] rounded-full bg-current opacity-60" style={{ height: h }} />
            ))}
        </span>
    );
}

type WhatsAppBubbleProps = {
    side: WhatsAppSide;
    text: string;
    time: string;
    /** A voice note: shown as one, with what was said under it. */
    voice?: boolean;
    /** Who on the business's side wrote it (the AI or a person), above the text. */
    sender?: { name: string; ai: boolean } | null;
    /** The first bubble of a run gets the tail, as WhatsApp draws it. */
    tail?: boolean;
};

export function WhatsAppBubble({ side, text, time, voice, sender, tail = true }: WhatsAppBubbleProps) {
    const out = side === 'out';
    return (
        <div className={cn('flex', out ? 'justify-end' : 'justify-start', tail ? 'mt-1.5' : '')}>
            <div
                className={cn(
                    'relative max-w-[78%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14.2px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
                    out
                        ? 'bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
                        : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]',
                    tail && (out ? 'rounded-tr-none' : 'rounded-tl-none'),
                )}
            >
                {tail ? (
                    <span
                        aria-hidden
                        className={cn(
                            'absolute top-0 size-2',
                            out
                                ? '-right-2 bg-[#d9fdd3] [clip-path:polygon(0_0,100%_0,0_100%)] dark:bg-[#005c4b]'
                                : '-left-2 bg-white [clip-path:polygon(0_0,100%_0,100%_100%)] dark:bg-[#202c33]',
                        )}
                    />
                ) : null}
                {sender ? (
                    <p className={cn('mb-0.5 flex items-center gap-1 text-xs font-medium', sender.ai ? 'text-[#027eb5] dark:text-[#53bdeb]' : 'text-[#c4167c] dark:text-[#ff72c3]')}>
                        {sender.ai ? <Bot className="size-3" aria-hidden /> : <UserRound className="size-3" aria-hidden />}
                        {sender.name}
                    </p>
                ) : null}
                {voice ? (
                    <div className="flex min-w-52 items-center gap-2 py-1 text-[#54656f] dark:text-[#8696a0]">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
                            <Mic className="size-4" aria-hidden />
                        </span>
                        <Waveform />
                        <span className="sr-only">Voice note</span>
                    </div>
                ) : null}
                <p className={cn('break-words whitespace-pre-wrap', voice && 'text-[13px] text-[#54656f] italic dark:text-[#8696a0]')}>
                    {voice ? (
                        <>
                            “<WhatsAppText text={text} />”
                        </>
                    ) : (
                        <WhatsAppText text={text} />
                    )}
                    <span className="invisible ml-2 inline-block w-14" aria-hidden />
                </p>
                <span className="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] text-[#667781] dark:text-[#8696a0]">
                    {time}
                    {out ? <CheckCheck className="size-4 text-[#53bdeb]" aria-label="Read" /> : null}
                </span>
            </div>
        </div>
    );
}

/** WhatsApp's own formatting: *bold*, _italic_, ~strike~. */
function WhatsAppText({ text }: { text: string }) {
    const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
    return (
        <>
            {parts.map((part, i) =>
                /^\*[^*]+\*$/.test(part) ? (
                    <strong key={i}>{part.slice(1, -1)}</strong>
                ) : /^_[^_]+_$/.test(part) ? (
                    <em key={i}>{part.slice(1, -1)}</em>
                ) : /^~[^~]+~$/.test(part) ? (
                    <s key={i}>{part.slice(1, -1)}</s>
                ) : (
                    part
                ),
            )}
        </>
    );
}

/** A WhatsApp call in the chat, as a pill: when, how long, and what was said. */
export function WhatsAppCallPill({ at, durationSec, summary, inbound }: { at: string; durationSec: number; summary: string | null; inbound: boolean }) {
    const minutes = Math.floor(durationSec / 60);
    const seconds = String(durationSec % 60).padStart(2, '0');
    return (
        <WhatsAppPill className="max-w-[80%]">
            <span className="flex items-center justify-center gap-1.5 font-medium text-[#111b21] dark:text-[#e9edef]">
                <Phone className="size-3.5 text-[#00a884]" aria-hidden />
                {inbound ? 'Voice call' : 'Outgoing call'} · {minutes}:{seconds} · {whatsappTime(at)}
            </span>
            {summary ? <span className="mt-0.5 block">{summary}</span> : null}
        </WhatsAppPill>
    );
}

type WhatsAppComposerProps = {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    disabled?: boolean;
    sending?: boolean;
    placeholder?: string;
    /** Given, an empty field shows WhatsApp's mic: hold a voice note, then send it or bin it. */
    voiceNote?: { recording: boolean; secs: number; start: () => void; stop: (send: boolean) => void };
};

const ROUND_BUTTON =
    'flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-opacity disabled:opacity-40';

/** WhatsApp's message bar: a rounded field and the round green send button (a mic while the field is empty). */
export function WhatsAppComposer({ value, onChange, onSend, disabled, sending, placeholder = 'Type a message', voiceNote }: WhatsAppComposerProps) {
    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!disabled && !sending && value.trim()) onSend();
    };
    if (voiceNote?.recording) {
        return (
            <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33]" role="status">
                <button
                    type="button"
                    onClick={() => voiceNote.stop(false)}
                    aria-label="Delete voice note"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5 dark:text-[#aebac1] dark:hover:bg-white/10"
                >
                    <Trash2 className="size-5" aria-hidden />
                </button>
                <span className="flex min-h-10 flex-1 items-center gap-2 rounded-lg bg-white px-3 text-sm text-[#111b21] dark:bg-[#2a3942] dark:text-[#e9edef]">
                    <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                    <span className="tabular-nums">
                        {Math.floor(voiceNote.secs / 60)}:{String(voiceNote.secs % 60).padStart(2, '0')}
                    </span>
                    <span className="text-[#667781]">Recording…</span>
                </span>
                <button type="button" onClick={() => voiceNote.stop(true)} aria-label="Send voice note" className={ROUND_BUTTON}>
                    <SendHorizontal className="size-5" aria-hidden />
                </button>
            </div>
        );
    }
    const mic = voiceNote && !value.trim();
    return (
        <form onSubmit={submit} className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-2.5 dark:bg-[#202c33]">
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) submit(e);
                }}
                rows={1}
                disabled={disabled}
                placeholder={placeholder}
                aria-label="Message"
                maxLength={4096}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm text-[#111b21] outline-none placeholder:text-[#667781] disabled:opacity-60 dark:bg-[#2a3942] dark:text-[#e9edef]"
            />
            {mic ? (
                <button
                    type="button"
                    onClick={voiceNote.start}
                    disabled={disabled || sending}
                    aria-label="Record a voice note"
                    className={ROUND_BUTTON}
                >
                    <Mic className="size-5" aria-hidden />
                </button>
            ) : (
                <button type="submit" disabled={disabled || sending || !value.trim()} aria-label="Send" className={ROUND_BUTTON}>
                    <SendHorizontal className="size-5" aria-hidden />
                </button>
            )}
        </form>
    );
}
