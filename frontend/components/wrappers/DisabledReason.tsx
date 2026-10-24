'use client';

import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Around a disabled control: hovering or focusing it says why (a disabled button fires no events of its own). */
export function DisabledReason({ reason, children }: { reason: string | null; children: ReactElement }) {
    if (!reason) return children;
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex" data-testid="disabled-reason">
                    {children}
                </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{reason}</TooltipContent>
        </Tooltip>
    );
}
