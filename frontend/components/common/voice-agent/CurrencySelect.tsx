'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDisplayCurrencyAction } from '@/app/actions/display-currency-actions';
import { FilterSelect } from '@/components/common/FilterToolbar';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';

/** The currency call costs are shown in, kept for this browser, for a `FilterToolbar`. Costs are kept in dollars and converted at today's rate. */
export function CurrencySelect() {
    const router = useRouter();
    const { code, codes, ratesDate } = useDisplayCurrency();
    const [saving, startSaving] = useTransition();

    const pick = (next: string) =>
        startSaving(async () => {
            await setDisplayCurrencyAction(next);
            router.refresh();
        });

    return (
        <FilterSelect
            label="Currency"
            value={code}
            options={codes.map((c) => ({ value: c, label: c }))}
            disabled={saving || codes.length < 2}
            onChange={pick}
            title={ratesDate ? `Converted from US dollars at the rate of ${ratesDate}` : undefined}
            className="sm:min-w-20"
        />
    );
}
