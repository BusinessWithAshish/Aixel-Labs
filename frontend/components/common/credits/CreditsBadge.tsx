'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getCurrentUserCredits } from '@/app/actions/user-actions';
import { Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Canonical credits icon. */
export const CreditsIcon = Coins;

type CreditsBadgeProps = {
    /** When set, renders this value (no fetch). When omitted, loads the signed-in user's balance. */
    credits?: number;
    className?: string;
};

/**
 * Single credits badge for the app header and anywhere else a chip is needed.
 */
export function CreditsBadge({ credits: creditsProp, className }: CreditsBadgeProps) {
    const [credits, setCredits] = useState<number | null>(
        creditsProp !== undefined ? creditsProp : null,
    );

    useEffect(() => {
        if (creditsProp !== undefined) {
            setCredits(creditsProp);
            return;
        }

        let cancelled = false;
        void (async () => {
            const result = await getCurrentUserCredits();
            if (cancelled) return;
            setCredits(result.success ? (result.data ?? 0) : 0);
        })();
        return () => {
            cancelled = true;
        };
    }, [creditsProp]);

    if (credits === null) {
        return (
            <span
                className={cn(
                    'inline-flex h-6 w-14 animate-pulse rounded-md border bg-muted/60',
                    className,
                )}
                aria-hidden
            />
        );
    }

    return (
        <Badge
            className={cn('gap-1.5 tabular-nums font-medium', className)}
            title={`${credits} credits remaining`}
        >
            <CreditsIcon className="size-3.5" aria-hidden />
            <span>{credits}</span>
            <span className="sr-only">credits</span>
        </Badge>
    );
}
