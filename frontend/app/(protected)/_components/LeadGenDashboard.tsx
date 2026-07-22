import { Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemGroup,
    ItemMedia,
    ItemSeparator,
    ItemTitle,
} from '@/components/ui/item';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import {
    DASHBOARD_SOURCE_META,
    type LeadGenerationDashboardStats,
} from '@/app/(protected)/_constants';
import { LeadsBySourceChart } from '@/app/(protected)/_components/LeadsBySourceChart';
import { LeadsTrendChart } from '@/app/(protected)/_components/LeadsTrendChart';
import { ACCOUNT_SETTINGS_ROUTE, SubModuleUrls } from '@/config/app-config';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CalendarDays, Coins, FolderOpen, ListIcon, Sparkles, UsersRound } from 'lucide-react';

type LeadGenDashboardProps = {
    stats: LeadGenerationDashboardStats;
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function LeadGenDashboard({ stats }: LeadGenDashboardProps) {
    const maxSourceCount = Math.max(...stats.bySource.map((row) => row.count), 1);
    const activeSources = stats.bySource.filter((row) => row.count > 0).length;
    const topSource = [...stats.bySource].sort((a, b) => b.count - a.count)[0];
    const topSourceMeta = topSource ? DASHBOARD_SOURCE_META[topSource.source] : null;
    const hasLeads = stats.totalLeads > 0;

    if (!hasLeads && stats.totalLists === 0) {
        return (
            <Empty className="border border-dashed">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <UsersRound />
                    </EmptyMedia>
                    <EmptyTitle>No leads yet</EmptyTitle>
                    <EmptyDescription>
                        Generate your first leads from Google Maps, Advanced Search, Instagram, or
                        LinkedIn by company. Stats and charts will show up here.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild>
                        <Link href={SubModuleUrls[LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]}>
                            Start with Google Maps
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href={SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LEADS]}>
                            Open leads lists
                        </Link>
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Lead generation overview</CardTitle>
                    <CardDescription>
                        Activity across Google Maps, Advanced Search, Instagram, and LinkedIn by
                        company.
                    </CardDescription>
                    <CardAction>
                        <Badge variant="secondary">
                            {activeSources}/{stats.bySource.length} sources used
                        </Badge>
                    </CardAction>
                </CardHeader>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Total leads</CardTitle>
                        <CardDescription>Saved across tracked sources</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Item variant="muted" size="sm">
                            <ItemMedia variant="icon" className="border-primary/20 bg-primary/10 text-primary">
                                <UsersRound />
                            </ItemMedia>
                            <ItemContent>
                                <ItemTitle className="text-2xl font-semibold tabular-nums text-primary">
                                    {stats.totalLeads.toLocaleString()}
                                </ItemTitle>
                                <ItemDescription>
                                    {stats.leadsThisWeek.toLocaleString()} in the last 7 days
                                </ItemDescription>
                            </ItemContent>
                        </Item>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Lead lists</CardTitle>
                        <CardDescription>Collections you have created</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Item variant="muted" size="sm">
                            <ItemMedia variant="icon" className="border-chart-2/30 bg-chart-2/15 text-chart-2">
                                <ListIcon />
                            </ItemMedia>
                            <ItemContent>
                                <ItemTitle className="text-2xl font-semibold tabular-nums text-chart-2">
                                    {stats.totalLists.toLocaleString()}
                                </ItemTitle>
                                <ItemDescription>
                                    Avg {stats.averageLeadsPerList.toLocaleString()} leads per list
                                </ItemDescription>
                            </ItemContent>
                        </Item>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Top source</CardTitle>
                        <CardDescription>Most used generation tool</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Item variant="muted" size="sm">
                            <ItemMedia variant="icon">
                                {topSourceMeta ? (
                                    <Image
                                        src={topSourceMeta.imageSrc}
                                        alt={topSourceMeta.imageAlt}
                                        width={16}
                                        height={16}
                                    />
                                ) : (
                                    <Sparkles className="text-chart-4" />
                                )}
                            </ItemMedia>
                            <ItemContent>
                                <ItemTitle className="text-base font-semibold text-foreground">
                                    {topSourceMeta?.label ?? '—'}
                                </ItemTitle>
                                <ItemDescription>
                                    {(topSource?.count ?? 0).toLocaleString()} leads
                                </ItemDescription>
                            </ItemContent>
                        </Item>
                    </CardContent>
                </Card>

                {!stats.creditsExempt && stats.credits != null ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Credits left</CardTitle>
                            <CardDescription>For future generation runs</CardDescription>
                            <CardAction>
                                <Button asChild size="sm" variant="outline">
                                    <Link href={ACCOUNT_SETTINGS_ROUTE}>Manage</Link>
                                </Button>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            <Item variant="muted" size="sm">
                                <ItemMedia variant="icon" className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    <Coins />
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                                        {stats.credits.toLocaleString()}
                                    </ItemTitle>
                                    <ItemDescription>Available credits</ItemDescription>
                                </ItemContent>
                            </Item>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>This week</CardTitle>
                            <CardDescription>New leads in the last 7 days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Item variant="muted" size="sm">
                                <ItemMedia variant="icon" className="border-chart-5/30 bg-chart-5/15 text-chart-5">
                                    <CalendarDays />
                                </ItemMedia>
                                <ItemContent>
                                    <ItemTitle className="text-2xl font-semibold tabular-nums text-chart-5">
                                        {stats.leadsThisWeek.toLocaleString()}
                                    </ItemTitle>
                                    <ItemDescription>Recently saved leads</ItemDescription>
                                </ItemContent>
                            </Item>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <LeadsBySourceChart bySource={stats.bySource} />
                <LeadsTrendChart trend={stats.trend} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Source breakdown</CardTitle>
                    <CardDescription>Share of leads by generation tool</CardDescription>
                </CardHeader>
                <CardContent>
                    <ItemGroup>
                        {stats.bySource.map((row, index) => {
                            const meta = DASHBOARD_SOURCE_META[row.source];
                            const share =
                                stats.totalLeads === 0
                                    ? 0
                                    : Math.round((row.count / stats.totalLeads) * 100);

                            return (
                                <Fragment key={row.source}>
                                    {index > 0 ? <ItemSeparator /> : null}
                                    <Item size="sm" asChild>
                                        <Link href={meta.href}>
                                            <ItemMedia variant="icon">
                                                <Image
                                                    src={meta.imageSrc}
                                                    alt={meta.imageAlt}
                                                    width={16}
                                                    height={16}
                                                />
                                            </ItemMedia>
                                            <ItemContent>
                                                <ItemTitle>{meta.label}</ItemTitle>
                                                <ItemDescription className="line-clamp-none">
                                                    {row.count.toLocaleString()} leads · {share}% of
                                                    total
                                                </ItemDescription>
                                            </ItemContent>
                                            <ItemActions>
                                                <Badge
                                                    variant="outline"
                                                    className="tabular-nums"
                                                    style={{
                                                        borderColor: meta.color,
                                                        color: meta.color,
                                                    }}
                                                >
                                                    {share}%
                                                </Badge>
                                            </ItemActions>
                                            <ItemFooter>
                                                <Progress value={(row.count / maxSourceCount) * 100} />
                                            </ItemFooter>
                                        </Link>
                                    </Item>
                                </Fragment>
                            );
                        })}
                    </ItemGroup>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent lists</CardTitle>
                    <CardDescription>Your newest lead collections</CardDescription>
                    <CardAction>
                        <Button asChild size="sm" variant="outline">
                            <Link href={SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LEADS]}>
                                View all
                            </Link>
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    {stats.recentLists.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <FolderOpen />
                                </EmptyMedia>
                                <EmptyTitle>No lists yet</EmptyTitle>
                                <EmptyDescription>
                                    Lists are created automatically when you generate leads.
                                </EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Leads</TableHead>
                                    <TableHead>Created</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.recentLists.map((list) => (
                                    <TableRow key={list.id}>
                                        <TableCell>
                                            <Link
                                                href={`${SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LEADS]}/${list.id}`}
                                            >
                                                {list.name}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="tabular-nums text-primary font-medium">
                                            {list.leadCount.toLocaleString()}
                                        </TableCell>
                                        <TableCell>{formatDate(list.createdAt)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
