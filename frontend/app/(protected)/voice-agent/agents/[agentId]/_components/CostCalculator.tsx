'use client';

import { useState } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/** A number typed in, or 0 while it is empty or not a number. */
const amount = (text: string) => Math.max(Number(text) || 0, 0);

/** What the agent would cost a day and a month (30 days) for a number of calls of an average length. */
export function CostCalculator({
    usdPerMinute,
    defaultMinutes,
    money,
}: {
    usdPerMinute: number;
    defaultMinutes: number;
    money: (usd: number) => string;
}) {
    const [calls, setCalls] = useState('10');
    const [minutes, setMinutes] = useState(String(defaultMinutes));
    const perDay = usdPerMinute * amount(calls) * amount(minutes);

    return (
        <div className="bg-background/60 grid gap-3 rounded-lg border p-3" data-testid="agent-cost-calculator">
            <div className="grid grid-cols-2 gap-3">
                <Field className="gap-1.5">
                    <FieldLabel htmlFor="cost-calls" className="text-xs">
                        Calls a day
                    </FieldLabel>
                    <Input
                        id="cost-calls"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={calls}
                        onChange={(e) => setCalls(e.target.value)}
                        className="h-8"
                    />
                </Field>
                <Field className="gap-1.5">
                    <FieldLabel htmlFor="cost-minutes" className="text-xs">
                        Minutes a call
                    </FieldLabel>
                    <Input
                        id="cost-minutes"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.5}
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                        className="h-8"
                    />
                </Field>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-center">
                <div className="grid gap-0.5">
                    <dt className="text-muted-foreground text-xs">A day</dt>
                    <dd className="font-semibold tabular-nums" data-testid="agent-cost-per-day">
                        {money(perDay)}
                    </dd>
                </div>
                <div className="grid gap-0.5">
                    <dt className="text-muted-foreground text-xs">A month (30 days)</dt>
                    <dd className="text-primary font-semibold tabular-nums" data-testid="agent-cost-per-month">
                        {money(perDay * 30)}
                    </dd>
                </div>
            </dl>
        </div>
    );
}
