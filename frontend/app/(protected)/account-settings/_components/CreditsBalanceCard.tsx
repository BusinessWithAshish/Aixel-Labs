import { CreditsIcon } from '@/components/common/credits/CreditsBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUserCredits } from '@/app/actions/user-actions';
import { creditsToneClassName } from '@/helpers/credits';
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

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <CreditsIcon className="size-4" aria-hidden />
                    </span>
                    Credits
                </CardTitle>
                <CardDescription>Your remaining balance for lead generation and other actions.</CardDescription>
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
                </p>
                <RedeemCouponForm />
            </CardContent>
        </Card>
    );
}
