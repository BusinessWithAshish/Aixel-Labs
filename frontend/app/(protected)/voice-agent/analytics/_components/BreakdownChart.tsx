'use client';

import type { ReactNode } from 'react';
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

export type BreakdownRow = { label: string; value: number; color?: string };

const ROW_HEIGHT = 36;
const chartConfig = { value: { label: 'Value', color: 'var(--chart-2)' } } satisfies ChartConfig;

/** A card with one bar per row, longest bar = biggest value, the value written at its end. */
export function BreakdownChart({
    title,
    description,
    rows,
    format = String,
    empty,
}: {
    title: string;
    description: ReactNode;
    rows: BreakdownRow[];
    format?: (value: number) => string;
    /** Shown instead of the bars when every row is zero. */
    empty: string;
}) {
    const shown = rows.some((row) => row.value > 0);
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {shown ? (
                    <ChartContainer
                        config={chartConfig}
                        className="aspect-auto w-full"
                        style={{ height: rows.length * ROW_HEIGHT + 8 }}
                    >
                        <BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 0, right: 64 }}>
                            <YAxis
                                dataKey="label"
                                type="category"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                width={128}
                            />
                            <XAxis dataKey="value" type="number" hide />
                            <Bar dataKey="value" radius={4} fill="var(--color-value)">
                                {rows.map((row) => (
                                    <Cell key={row.label} fill={row.color ?? 'var(--color-value)'} />
                                ))}
                                <LabelList
                                    dataKey="value"
                                    position="right"
                                    offset={8}
                                    className="fill-foreground"
                                    fontSize={12}
                                    formatter={(value) => format(Number(value))}
                                />
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                ) : (
                    <p className="text-muted-foreground text-sm">{empty}</p>
                )}
            </CardContent>
        </Card>
    );
}
