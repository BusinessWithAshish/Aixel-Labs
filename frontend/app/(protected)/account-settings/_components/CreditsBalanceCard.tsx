import { CreditsIcon } from '@/components/common/credits/CreditsBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUserCredits } from '@/app/actions/user-actions';
import { formatDistanceToNow } from 'date-fns';
import { CREDITS_REFILL_PERIOD_DAYS, creditsToneClassName, DAILY_LEAD_CAP, MONTHLY_FREE_CREDITS } from '@/helpers/credits';
import { cn } from '@/lib/utils';
import { RedeemCouponForm } from './RedeemCouponForm';

export async function CreditsBalanceCard() {
    // Card is only rendered for non-admins (admins are exempt — see credits-system rule).
    // On a failed read we fall back to 0, matching the previous try/catch behavior.
    const result = await getCurrentUserCredits();
    if (result.success && result.data?.exempt) {
        return null;
    }
    const credits = result.success && result.data ? result.data.credits : 0;
    const refillsAt = result.success ? result.data?.refillsAt : undefined;
    const dailyRemaining = result.success ? result.data?.dailyRemaining : undefined;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CreditsIcon className="size-4" aria-hidden />
                    </span>
                    Credits
                </CardTitle>
                <CardDescription>
                    Your remaining balance for lead generation and other actions. Free credits refill to{' '}
                    {MONTHLY_FREE_CREDITS.toLocaleString('en-US')} every {CREDITS_REFILL_PERIOD_DAYS} days. You can
                    use up to {DAILY_LEAD_CAP} a day.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p
                    className={cn(
                        'text-3xl font-semibold tracking-tight tabular-nums',
                        creditsToneClassName(credits),
                    )}
                >
                    {credits}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {credits === 1 ? '1 credit available' : `${credits} credits available`}
                    {refillsAt ? ` · next free refill ${formatDistanceToNow(refillsAt, { addSuffix: true })}` : null}
                </p>
                {dailyRemaining !== undefined ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {dailyRemaining} of {DAILY_LEAD_CAP} left today
                    </p>
                ) : null}
                <RedeemCouponForm />
            </CardContent>
        </Card>
    );
}
