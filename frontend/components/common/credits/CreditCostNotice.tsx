import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CreditsIcon } from '@/components/common/credits/CreditsBadge';
import { Badge } from '@/components/ui/badge';
import { formatCreditCostPerItemLabel } from '@/helpers/credits';
import { cn } from '@/lib/utils';

type CreditCostNoticeProps = {
    module: LEAD_GENERATION_SUB_MODULES;
    className?: string;
};

/** Compact per-result credit cost hint. Reads cost from `helpers/credits`. */
export function CreditCostNotice({ module, className }: CreditCostNoticeProps) {
    return (
        <Badge variant="secondary" className={cn('gap-1.5 font-normal', className)}>
            <CreditsIcon aria-hidden />
            {formatCreditCostPerItemLabel(module)}
        </Badge>
    );
}
