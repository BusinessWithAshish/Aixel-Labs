'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDisplayCurrencyAction } from '@/app/actions/display-currency-actions';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** The currency call costs are shown in, kept for this browser. Costs are kept in dollars and converted at today's rate. */
export function CurrencySelect({ className }: { className?: string }) {
    const router = useRouter();
    const { code, codes, ratesDate } = useDisplayCurrency();
    const [saving, startSaving] = useTransition();

    const pick = (next: string) =>
        startSaving(async () => {
            await setDisplayCurrencyAction(next);
            router.refresh();
        });

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <Label htmlFor="display-currency">Currency</Label>
            <Select value={code} disabled={saving || codes.length < 2} onValueChange={pick}>
                <SelectTrigger
                    id="display-currency"
                    className="w-full"
                    title={ratesDate ? `Converted from US dollars at the rate of ${ratesDate}` : undefined}
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {codes.map((c) => (
                        <SelectItem key={c} value={c}>
                            {c}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
