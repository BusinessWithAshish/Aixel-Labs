'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getCurrentUserCredits } from '@/app/actions/user-actions';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { creditsBadgeVariant, type UserCreditsState } from '@/helpers/credits';
import { eventBus } from '@/lib/event-bus';
import { ACCOUNT_SETTINGS_ROUTE } from '@/config/app-config';

/** Canonical credits icon. */
export const CreditsIcon = Coins;

/** Survives PageLayout remounts so navigation does not flash empty. */
let cached: UserCreditsState | null = null;

/** Update header badge after a debit (and notify any mounted badge). */
export function setCreditsBadgeCache(credits: number): void {
    if (cached?.exempt) return;
    cached = { credits, exempt: false };
    void eventBus.publish('credits:updated', credits);
}

type CreditsBadgeProps = {
    /** When set, renders this value (no fetch). When omitted, loads the signed-in user's balance. */
    credits?: number;
    className?: string;
};

/**
 * Header credits chip. Hidden for admins. Uses a module cache so remounts keep the last balance.
 * No skeleton — avoids an empty/loader flash for admins and on navigation.
 */
export function CreditsBadge({ credits: creditsProp, className }: CreditsBadgeProps) {
    const [state, setState] = useState<UserCreditsState | null>(() => {
        if (creditsProp !== undefined) return { credits: creditsProp, exempt: false };
        return cached;
    });

    useEffect(() => {
        if (creditsProp !== undefined) {
            const next = { credits: creditsProp, exempt: false };
            cached = next;
            setState(next);
            return;
        }

        let cancelled = false;
        void (async () => {
            const result = await getCurrentUserCredits();
            if (cancelled || !result.success || !result.data) return;
            cached = result.data;
            setState(result.data);
        })();

        const unsubscribe = eventBus.subscribe('credits:updated', (next) => {
            const updated = { credits: next, exempt: false as const };
            cached = updated;
            if (!cancelled) setState(updated);
        });

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [creditsProp]);

    if (!state || state.exempt) return null;

    return (
        <Link href={ACCOUNT_SETTINGS_ROUTE} aria-label="View credits in account settings">
            <Badge
                variant={creditsBadgeVariant(state.credits)}
                className={cn('gap-1.5 tabular-nums font-medium cursor-pointer', className)}
                title={`${state.credits} credits remaining`}
            >
                <CreditsIcon className="size-3.5" aria-hidden />
                <span>{state.credits}</span>
                <span className="sr-only">credits</span>
            </Badge>
        </Link>
    );
}
