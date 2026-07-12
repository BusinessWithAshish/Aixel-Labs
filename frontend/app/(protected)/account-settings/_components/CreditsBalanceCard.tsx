import { getAppSession } from '@/lib/auth/session';
import { CreditsIcon } from '@/components/common/credits/CreditsBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserCredits } from '@/app/actions/credit-db';
import { creditsToneClassName } from '@/helpers/credits';
import { cn } from '@/lib/utils';

export async function CreditsBalanceCard() {
    const session = await getAppSession();
    if (!session?.user?.id || session.user.isAdmin) {
        return null;
    }

    let credits = 0;
    try {
        credits = await getUserCredits(session.user.id);
    } catch {
        credits = 0;
    }

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
            </CardContent>
        </Card>
    );
}
