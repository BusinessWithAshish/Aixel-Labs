import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Stat = {
    label: string;
    value: ReactNode;
    /** A short line under the value. */
    note?: ReactNode;
    /** Extra classes for the value, e.g. a tone colour. */
    valueClassName?: string;
};

/** Headline numbers in one slim bordered row, side by side (two columns on a phone). */
export function StatStrip({ stats, className, ...props }: { stats: Stat[] } & ComponentProps<'dl'>) {
    return (
        <dl
            className={cn('grid grid-cols-2 gap-3 rounded-lg border px-4 py-3 sm:flex sm:flex-wrap sm:gap-x-8', className)}
            {...props}
        >
            {stats.map((stat) => (
                <div key={stat.label} className="flex min-w-0 flex-col">
                    <dt className="text-muted-foreground text-xs">{stat.label}</dt>
                    <dd className={cn('text-base font-semibold tabular-nums', stat.valueClassName)}>{stat.value}</dd>
                    {stat.note ? <dd className="text-muted-foreground text-xs">{stat.note}</dd> : null}
                </div>
            ))}
        </dl>
    );
}
