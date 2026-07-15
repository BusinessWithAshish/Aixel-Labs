'use client';

import { useEffect, useState } from 'react';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { getCurrentUserCredits } from '@/app/actions/user-actions';
import { CreditsIcon } from '@/components/common/credits/CreditsBadge';
import { Badge } from '@/components/ui/badge';
import { formatCreditCostPerItemLabel } from '@/helpers/credits';
import { cn } from '@/lib/utils';

type CreditCostNoticeProps = {
    module: LEAD_GENERATION_SUB_MODULES;
    className?: string;
};

/**
 * Compact per-result credit cost hint. Hidden for credit-exempt users (admins).
 * Reads cost from `helpers/credits`.
 */
export function CreditCostNotice({ module, className }: CreditCostNoticeProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const result = await getCurrentUserCredits();
            if (cancelled || !result.success || !result.data) return;
            if (!result.data.exempt) setVisible(true);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!visible) return null;

    return (
        <Badge variant="secondary" className={cn('gap-1.5 font-normal', className)}>
            <CreditsIcon aria-hidden />
            {formatCreditCostPerItemLabel(module)}
        </Badge>
    );
}
