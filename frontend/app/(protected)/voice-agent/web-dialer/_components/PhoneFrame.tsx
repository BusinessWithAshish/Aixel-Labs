import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PhoneFrameProps = {
    children: ReactNode;
    className?: string;
    classNames?: { screen?: string };
};

/** An iPhone-like body (bezel, dynamic island, home bar) from `sm` up; on a phone the screen stands alone. */
export function PhoneFrame({ children, className, classNames }: PhoneFrameProps) {
    return (
        <div
            className={cn(
                'mx-auto w-full max-w-sm',
                'sm:max-w-[23.5rem] sm:rounded-[3.25rem] sm:bg-zinc-950 sm:p-2.5 sm:shadow-2xl sm:ring-4 sm:ring-zinc-300 sm:dark:ring-zinc-700',
                className,
            )}
        >
            <div
                className={cn(
                    'bg-background text-foreground relative flex flex-col overflow-hidden rounded-3xl sm:h-[47rem] sm:rounded-[2.75rem]',
                    classNames?.screen,
                )}
            >
                <div aria-hidden className="mx-auto mt-2.5 hidden h-7 w-28 shrink-0 rounded-full bg-black sm:block" />
                {children}
                <div aria-hidden className="bg-foreground/70 mx-auto mb-2 hidden h-1 w-32 shrink-0 rounded-full sm:block" />
            </div>
        </div>
    );
}
