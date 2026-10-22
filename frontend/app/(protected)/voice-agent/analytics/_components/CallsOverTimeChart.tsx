'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import type { VoiceAnalytics } from '@/app/actions/voice-analytics-actions';
import { TONE_COLORS } from '@/helpers/voice-call-outcomes';

const chartConfig = {
    answered: { label: 'Answered', color: TONE_COLORS.good },
    unanswered: { label: 'Not answered', color: TONE_COLORS.fair },
} satisfies ChartConfig;

/** "22 Oct" for a day, "Oct 2026" for a month (keys are already on the analytics clock). */
function periodLabel(period: string, by: VoiceAnalytics['period']): string {
    const date = new Date(`${by === 'day' ? period : `${period}-01`}T00:00:00Z`);
    return date.toLocaleDateString(undefined, {
        timeZone: 'UTC',
        ...(by === 'day' ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' }),
    });
}

export function CallsOverTimeChart({ analytics }: { analytics: VoiceAnalytics }) {
    const data = analytics.overTime.map((row) => ({ ...row, label: periodLabel(row.period, analytics.period) }));
    return (
        <Card>
            <CardHeader>
                <CardTitle>Calls over time</CardTitle>
                <CardDescription>
                    Calls per {analytics.period}, and how many were answered (the other side spoke).
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
                    <BarChart accessibilityLayer data={data} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <ChartLegend content={<ChartLegendContent />} />
                        <Bar dataKey="answered" stackId="calls" fill="var(--color-answered)" />
                        <Bar dataKey="unanswered" stackId="calls" fill="var(--color-unanswered)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
