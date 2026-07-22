'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import type { LeadDayCount } from '@/app/(protected)/_constants';

type LeadsTrendChartProps = {
    trend: LeadDayCount[];
};

/** Uses `--primary` from `globals.css` so the trend chart matches the app theme. */
const chartConfig = {
    count: {
        label: 'Leads',
        color: 'var(--primary)',
    },
} satisfies ChartConfig;

export function LeadsTrendChart({ trend }: LeadsTrendChartProps) {
    const chartData = trend.map((row) => ({
        date: row.date,
        count: row.count,
        label: new Date(`${row.date}T00:00:00.000Z`).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        }),
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Generation activity</CardTitle>
                <CardDescription>Leads saved over the last 14 days</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                    <AreaChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={24}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="line" />}
                        />
                        <Area
                            dataKey="count"
                            type="natural"
                            fill="var(--color-count)"
                            fillOpacity={0.35}
                            stroke="var(--color-count)"
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
