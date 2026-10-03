'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Info, PartyPopper } from 'lucide-react';

/** In-game notices, styled like the rest of the table (the app's default toasts look like a dashboard). */
export type GameToastTone = 'error' | 'good' | 'info' | 'gold';
type GameToast = { id: number; tone: GameToastTone; text: string };

const SHOW_MS = 3200;
let seq = 0;
let toasts: GameToast[] = [];
const listeners = new Set<(list: GameToast[]) => void>();

function emit() {
    listeners.forEach((fn) => fn(toasts));
}

export function notify(text: string, tone: GameToastTone = 'info') {
    const id = ++seq;
    toasts = [...toasts.slice(-2), { id, tone, text }];
    emit();
    window.setTimeout(() => {
        toasts = toasts.filter((t) => t.id !== id);
        emit();
    }, SHOW_MS);
}

const ICONS = { error: CircleAlert, good: CircleCheck, info: Info, gold: PartyPopper };

export function GameToasts() {
    const [list, setList] = useState<GameToast[]>([]);
    useEffect(() => {
        listeners.add(setList);
        return () => {
            listeners.delete(setList);
        };
    }, []);
    return (
        <div className="toasts" aria-live="polite">
            {list.map((t) => {
                const Icon = ICONS[t.tone];
                return (
                    <div key={t.id} className={`toast ${t.tone}`}>
                        <Icon className="lu" />
                        <span>{t.text}</span>
                    </div>
                );
            })}
        </div>
    );
}
