'use client';

import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
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
import { DASHBOARD_SOURCE_META, type LeadSourceCount } from '@/app/(protected)/_constants';

type LeadsBySourceChartProps = {
    bySource: LeadSourceCount[];
};

export function LeadsBySourceChart({ bySource }: LeadsBySourceChartProps) {
    const chartData = bySource.map((row) => {
        const meta = DASHBOARD_SOURCE_META[row.source];
        return {
            source: meta.chartKey,
            leads: row.count,
            fill: `url(#grad-${meta.chartKey})`,
        };
    });

    const chartConfig = {
        leads: { label: 'Leads' },
        ...Object.fromEntries(
            bySource.map((row) => {
                const meta = DASHBOARD_SOURCE_META[row.source];
                return [meta.chartKey, { label: meta.label, color: meta.color }];
            }),
        ),
    } satisfies ChartConfig;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Leads by source</CardTitle>
                <CardDescription>Saved leads across your generation tools</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                    <BarChart
                        accessibilityLayer
                        data={chartData}
                        layout="vertical"
                        margin={{ left: 8, right: 28 }}
                    >
                        <defs>
                            {bySource.map((row) => {
                                const meta = DASHBOARD_SOURCE_META[row.source];
                                const last = meta.gradient.length - 1;
                                return (
                                    <linearGradient
                                        key={meta.chartKey}
                                        id={`grad-${meta.chartKey}`}
                                        x1="0"
                                        y1="0"
                                        x2="1"
                                        y2="0"
                                    >
                                        {meta.gradient.map((stopColor, i) => (
                                            <stop
                                                key={`${meta.chartKey}-${i}`}
                                                offset={last === 0 ? '0%' : `${(i / last) * 100}%`}
                                                stopColor={stopColor}
                                            />
                                        ))}
                                    </linearGradient>
                                );
                            })}
                        </defs>
                        <YAxis
                            dataKey="source"
                            type="category"
                            tickLine={false}
                            tickMargin={8}
                            axisLine={false}
                            width={148}
                            tickFormatter={(value) =>
                                chartConfig[value as keyof typeof chartConfig]?.label?.toString() ??
                                value
                            }
                        />
                        <XAxis dataKey="leads" type="number" hide />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                        <Bar dataKey="leads" radius={5}>
                            {chartData.map((entry) => (
                                <Cell key={entry.source} fill={entry.fill} />
                            ))}
                            <LabelList
                                dataKey="leads"
                                position="right"
                                offset={8}
                                className="fill-foreground"
                                fontSize={12}
                            />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
