'use client';

import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import type { VoiceCampaignResult } from '@/app/actions/voice-analytics-actions';
import { TONE_COLORS } from '@/helpers/voice-call-outcomes';

const ROW_HEIGHT = 40;
const chartConfig = {
    answered: { label: 'Answered', color: TONE_COLORS.good },
    unreached: { label: 'Not reached', color: TONE_COLORS.fair },
    failed: { label: 'Failed', color: TONE_COLORS.bad },
    waiting: { label: 'Still to call', color: 'var(--chart-3)' },
    skipped: { label: 'Skipped', color: 'var(--muted-foreground)' },
} satisfies ChartConfig;
const PARTS = Object.keys(chartConfig) as (keyof typeof chartConfig)[];

/** One bar per campaign, split by where its contacts ended up. */
export function CampaignResultsChart({ campaigns }: { campaigns: VoiceCampaignResult[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Campaign results</CardTitle>
                <CardDescription>
                    How the contacts of each campaign that ran in this period ended up
                    {campaigns.length ? `; ${campaigns.reduce((sum, c) => sum + c.booked, 0)} booked an appointment` : ''}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {campaigns.length ? (
                    <ChartContainer
                        config={chartConfig}
                        className="aspect-auto w-full"
                        style={{ height: campaigns.length * ROW_HEIGHT + 48 }}
                    >
                        <BarChart accessibilityLayer data={campaigns} layout="vertical" margin={{ left: 0, right: 8 }}>
                            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={128} />
                            <XAxis type="number" hide allowDecimals={false} />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
                            {PARTS.map((part, i) => (
                                <Bar
                                    key={part}
                                    dataKey={part}
                                    stackId="contacts"
                                    fill={`var(--color-${part})`}
                                    radius={i === PARTS.length - 1 ? [0, 4, 4, 0] : 0}
                                />
                            ))}
                        </BarChart>
                    </ChartContainer>
                ) : (
                    <p className="text-muted-foreground text-sm">No campaign ran in this period.</p>
                )}
            </CardContent>
        </Card>
    );
}
