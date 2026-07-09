'use client';

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    CardAction,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Website } from '@/components/common/lead-card/ExternalContacts';
import { cn } from '@/lib/utils';
import type { LINKEDIN_BY_COMPANY_RESPONSE } from '@aixellabs/backend/linkedin/types';
import {
    Briefcase,
    Building2,
    CalendarDays,
    Heart,
    Link2,
    MapPin,
    MessageCircle,
    Trash2,
    Users,
} from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_DISPLAY_VALUE = 'N/A';
const LINKEDIN_BLUE = '#0A66C2';

type LinkedInByCompanyLeadCardProps = {
    lead: LINKEDIN_BY_COMPANY_RESPONSE;
    className?: string;
    actions?: ReactNode;
    showCheckbox?: boolean;
    onDelete?: () => void;
    onSelect?: (selected: boolean) => void;
    isSelected?: boolean;
};

function getInitials(name: string) {
    if (name === DEFAULT_DISPLAY_VALUE) return '?';
    return name
        .split(/\s+/)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function formatNumber(num: number | null | undefined) {
    if (num == null || Number.isNaN(num)) return DEFAULT_DISPLAY_VALUE;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
}

function parseSpecialties(specialties: string | null | undefined): string[] {
    if (!specialties?.trim()) return [];
    return specialties
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
}

function formatLocation(lead: LINKEDIN_BY_COMPANY_RESPONSE): string | null {
    if (lead.headquaters?.trim()) return lead.headquaters.trim();

    const { locality, region, country, code } = lead.address ?? {};
    const parts = [locality, region, country, code].filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0,
    );
    return parts.length ? parts.join(', ') : null;
}

function formatCompactDate(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.trim();
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function pageNames(
    pages: { name: string | null; url: string | null }[] | null | undefined,
    limit = 3,
): { names: string[]; total: number } {
    const names = (pages ?? [])
        .map((p) => p.name?.trim())
        .filter((n): n is string => Boolean(n));
    return { names: names.slice(0, limit), total: names.length };
}

export function LinkedInByCompanyLeadCard(props: LinkedInByCompanyLeadCardProps) {
    const { lead, className, actions, showCheckbox, onDelete, onSelect, isSelected } = props;

    const leadInfo = useMemo(() => {
        const name = lead.name?.trim() || DEFAULT_DISPLAY_VALUE;
        const taglines = (lead.taglines ?? []).map((t) => t?.trim()).filter((t): t is string => Boolean(t));
        const tagline = taglines[0] ?? null;
        const funding = lead.funding_info;
        const fundingLabel = funding?.last_round_amount?.trim()
            ? funding.last_round_amount.trim()
            : funding?.total_rounds != null
                ? `${funding.total_rounds} rounds`
                : null;
        const lastPost = lead.recent_posts?.[0];
        const lastPostDate =
            formatCompactDate(lead.last_post_date) ??
            (lastPost?.time?.trim() || null);
        const lastPostEngagement =
            lastPost && (lastPost.reactions != null || lastPost.comments != null)
                ? {
                    reactions: lastPost.reactions,
                    comments: lastPost.comments,
                    url: lastPost.url,
                }
                : null;
        const investors = (funding?.investors ?? [])
            .map((i) => i?.trim())
            .filter((i): i is string => Boolean(i))
            .slice(0, 4);
        const similar = pageNames(lead.similar_pages);
        const affiliated = pageNames(lead.affiliated_pages);

        return {
            name,
            url: lead.url,
            logoUrl: lead.logo_url ?? undefined,
            logoDescription: lead.logo_description?.trim() || null,
            industry: lead.industry?.trim() || null,
            companyType: lead.company_type?.trim() || null,
            companySize: lead.company_size?.trim().replace(' employees', '') || null,
            description: lead.description?.trim() || null,
            tagline,
            extraTaglines: taglines.slice(1, 3),
            website: lead.website,
            followers: lead.followers,
            employeeCount: lead.employee_count,
            isHiring: lead.is_hiring === true,
            specialties: parseSpecialties(lead.specialties),
            location: formatLocation(lead),
            fundingLabel,
            lastRoundType: funding?.last_round_type?.trim() || null,
            lastRoundDate: formatCompactDate(funding?.last_round_date),
            totalRounds: funding?.total_rounds ?? null,
            investors,
            lastPostDate,
            lastPostEngagement,
            similar,
            affiliated,
        };
    }, [lead]);

    const [descExpanded, setDescExpanded] = useState(false);
    const [descOverflows, setDescOverflows] = useState(false);
    const descRef = useRef<HTMLParagraphElement>(null);

    const [taglineExpanded, setTaglineExpanded] = useState(false);
    const [taglineOverflows, setTaglineOverflows] = useState(false);
    const taglineRef = useRef<HTMLParagraphElement>(null);

    useLayoutEffect(() => {
        if (descExpanded) return;

        const el = descRef.current;
        if (!el || !leadInfo.description) {
            setDescOverflows(false);
            return;
        }

        const checkOverflow = () => {
            setDescOverflows(el.scrollHeight > el.clientHeight + 1);
        };

        checkOverflow();
        const observer = new ResizeObserver(checkOverflow);
        observer.observe(el);
        return () => observer.disconnect();
    }, [leadInfo.description, descExpanded]);

    useLayoutEffect(() => {
        if (taglineExpanded) return;

        const el = taglineRef.current;
        if (!el || !leadInfo.tagline || !leadInfo.industry) {
            setTaglineOverflows(false);
            return;
        }

        const checkOverflow = () => {
            setTaglineOverflows(el.scrollHeight > el.clientHeight + 1);
        };

        checkOverflow();
        const observer = new ResizeObserver(checkOverflow);
        observer.observe(el);
        return () => observer.disconnect();
    }, [leadInfo.tagline, leadInfo.industry, taglineExpanded]);

    const openLinkedIn = () => {
        if (leadInfo.url) {
            window.open(leadInfo.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <Card
            className={cn(
                'relative h-fit min-h-[320px] w-full gap-3 overflow-hidden py-2 transition-shadow hover:shadow-lg',
                isSelected && 'ring-2 ring-primary',
                className,
            )}
        >
            {onDelete && (
                <div className="absolute bottom-4 right-4 z-10">
                    <Button
                        type="button"
                        onClick={onDelete}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                        title="Remove from results"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <CardHeader className="flex min-w-0 items-start justify-between gap-2 overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                    <section className="flex min-w-0 w-full items-center gap-2">
                        {showCheckbox && onSelect && (
                            <Checkbox
                                className="shrink-0"
                                checked={isSelected}
                                onCheckedChange={onSelect}
                            />
                        )}
                        <Avatar
                            className="size-11 shrink-0 rounded-md!"
                            title={leadInfo.logoDescription ?? undefined}
                        >
                            <AvatarImage
                                src={leadInfo.logoUrl}
                                alt={leadInfo.logoDescription ?? leadInfo.name}
                                className="object-cover"
                            />
                            <AvatarFallback
                                className="rounded-md! text-sm font-semibold text-white"
                                style={{ backgroundColor: LINKEDIN_BLUE }}
                            >
                                {getInitials(leadInfo.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-1 flex-col items-start overflow-hidden">
                            <CardTitle className="flex w-full min-w-0 max-w-full items-center gap-1.5">
                                <span className="min-w-0 flex-1 truncate" title={leadInfo.name}>
                                    {leadInfo.name}
                                </span>
                            </CardTitle>
                            <CardDescription className="w-full truncate" title={leadInfo.industry ?? undefined}>
                                {leadInfo.industry ?? leadInfo.tagline ?? 'Company'}
                            </CardDescription>
                        </div>
                    </section>

                    <section className="flex flex-wrap items-center gap-1.5">
                        {leadInfo.isHiring && (
                            <Badge size="sm" variant="green" className="rounded-full">
                                Hiring
                            </Badge>
                        )}
                        {leadInfo.companyType && (
                            <Badge size="sm" variant="blue" className="rounded-full">
                                {leadInfo.companyType}
                            </Badge>
                        )}
                        {leadInfo.fundingLabel && (
                            <Badge size="sm" variant="purple" className="rounded-full">
                                {leadInfo.lastRoundType
                                    ? `${leadInfo.lastRoundType} · ${leadInfo.fundingLabel}`
                                    : `Funding · ${leadInfo.fundingLabel}`}
                            </Badge>
                        )}
                        {leadInfo.lastRoundDate && (
                            <Badge size="sm" variant="secondary" className="rounded-full">
                                {leadInfo.lastRoundDate}
                            </Badge>
                        )}
                        {leadInfo.totalRounds != null && !leadInfo.fundingLabel?.includes('round') && (
                            <Badge size="sm" variant="secondary" className="rounded-full">
                                {leadInfo.totalRounds} rounds
                            </Badge>
                        )}
                    </section>
                </div>

                <CardAction className="shrink-0">
                    <Button
                        onClick={openLinkedIn}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full transition-all duration-100 hover:scale-110"
                        title="Open on LinkedIn"
                        aria-label="Open company on LinkedIn"
                        disabled={!leadInfo.url}
                    >
                        <Image
                            src="/linkedin-logo-svg.png"
                            alt="LinkedIn"
                            width={20}
                            height={20}
                        />
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-2 overflow-hidden">
                <dl className="flex w-full min-w-0 items-stretch justify-between gap-2 rounded-md bg-muted-foreground/10 p-2">
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                        <dt className="w-full truncate text-center text-sm font-semibold tabular-nums">
                            {formatNumber(leadInfo.followers)}
                        </dt>
                        <dd className="flex w-full items-center justify-center gap-1 truncate text-center text-xs text-muted-foreground">
                            <Users className="size-3 shrink-0 opacity-70" />
                            Followers
                        </dd>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                        <dt className="w-full truncate text-center text-sm font-semibold tabular-nums">
                            {formatNumber(leadInfo.employeeCount)}
                        </dt>
                        <dd className="flex w-full items-center justify-center gap-1 truncate text-center text-xs text-muted-foreground">
                            <Building2 className="size-3 shrink-0 opacity-70" />
                            Employees
                        </dd>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                        <dt
                            className="w-full truncate text-center text-sm font-semibold"
                            title={leadInfo.companySize ?? undefined}
                        >
                            {leadInfo.companySize ?? DEFAULT_DISPLAY_VALUE}
                        </dt>
                        <dd className="flex w-full items-center justify-center gap-1 truncate text-center text-xs text-muted-foreground">
                            <Briefcase className="size-3 shrink-0 opacity-70" />
                            Size
                        </dd>
                    </div>
                </dl>

                {leadInfo.tagline && leadInfo.industry && (
                    <div className="min-w-0">
                        <p
                            ref={taglineRef}
                            className={cn(
                                'min-w-0 text-sm font-medium text-foreground/90 wrap-break-words',
                                !taglineExpanded && 'line-clamp-2',
                            )}
                        >
                            {leadInfo.tagline}
                        </p>
                        {taglineOverflows && (
                            <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-sm font-medium"
                                onClick={() => setTaglineExpanded((e) => !e)}
                            >
                                {taglineExpanded ? 'See less' : 'See more'}
                            </Button>
                        )}
                    </div>
                )}

                {leadInfo.extraTaglines.length > 0 && (
                    <p
                        className="truncate text-xs text-muted-foreground"
                        title={leadInfo.extraTaglines.join(' · ')}
                    >
                        {leadInfo.extraTaglines.join(' · ')}
                    </p>
                )}

                {leadInfo.description && (
                    <div className="min-w-0">
                        <p
                            ref={descRef}
                            className={cn(
                                'min-w-0 text-sm leading-relaxed text-muted-foreground wrap-break-words',
                                !descExpanded && 'line-clamp-3',
                            )}
                        >
                            {leadInfo.description}
                        </p>
                        {descOverflows && (
                            <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-sm font-medium"
                                onClick={() => setDescExpanded((e) => !e)}
                            >
                                {descExpanded ? 'See less' : 'See more'}
                            </Button>
                        )}
                    </div>
                )}

                {leadInfo.specialties.length > 0 && (
                    <div className="min-w-0 w-full max-w-full overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
                        <div className="flex w-max flex-nowrap items-center gap-1.5">
                            {leadInfo.specialties.map((specialty) => (
                                <Badge
                                    key={specialty}
                                    variant="secondary"
                                    className="shrink-0 whitespace-nowrap rounded-full"
                                >
                                    {specialty}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {(leadInfo.lastPostDate || leadInfo.lastPostEngagement) && (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {leadInfo.lastPostDate && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                                <CalendarDays className="size-3.5 shrink-0 opacity-70" />
                                <span className="truncate" title={leadInfo.lastPostDate}>
                                    Last post {leadInfo.lastPostDate}
                                </span>
                            </span>
                        )}
                        {leadInfo.lastPostEngagement && (
                            <span className="inline-flex items-center gap-2.5">
                                {leadInfo.lastPostEngagement.reactions != null && (
                                    <span className="inline-flex items-center gap-1 tabular-nums">
                                        <Heart className="size-3.5 shrink-0 fill-red-400/25 text-red-400" />
                                        {formatNumber(leadInfo.lastPostEngagement.reactions)}
                                    </span>
                                )}
                                {leadInfo.lastPostEngagement.comments != null && (
                                    <span className="inline-flex items-center gap-1 tabular-nums">
                                        <MessageCircle className="size-3.5 shrink-0 opacity-70" />
                                        {formatNumber(leadInfo.lastPostEngagement.comments)}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                )}

                {leadInfo.investors.length > 0 && (
                    <p
                        className="truncate text-xs text-muted-foreground"
                        title={leadInfo.investors.join(', ')}
                    >
                        <span className="font-medium text-foreground/80">Investors</span>
                        {' · '}
                        {leadInfo.investors.join(', ')}
                    </p>
                )}

                {leadInfo.location && (
                    <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate" title={leadInfo.location}>
                            {leadInfo.location}
                        </span>
                    </div>
                )}

                {(leadInfo.similar.total > 0 || leadInfo.affiliated.total > 0) && (
                    <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                        {leadInfo.similar.total > 0 && (
                            <p className="truncate" title={leadInfo.similar.names.join(', ')}>
                                <Link2 className="mr-1 inline size-3 opacity-70" />
                                <span className="font-medium text-foreground/80">Similar</span>
                                {' · '}
                                {leadInfo.similar.names.join(', ')}
                                {leadInfo.similar.total > leadInfo.similar.names.length
                                    ? ` +${leadInfo.similar.total - leadInfo.similar.names.length}`
                                    : ''}
                            </p>
                        )}
                        {leadInfo.affiliated.total > 0 && (
                            <p className="truncate" title={leadInfo.affiliated.names.join(', ')}>
                                <Building2 className="mr-1 inline size-3 opacity-70" />
                                <span className="font-medium text-foreground/80">Affiliated</span>
                                {' · '}
                                {leadInfo.affiliated.names.join(', ')}
                                {leadInfo.affiliated.total > leadInfo.affiliated.names.length
                                    ? ` +${leadInfo.affiliated.total - leadInfo.affiliated.names.length}`
                                    : ''}
                            </p>
                        )}
                    </div>
                )}

                {actions && <div className="border-t pt-2">{actions}</div>}
            </CardContent>

            <CardFooter className="flex min-w-0 flex-col items-start gap-2 overflow-hidden">
                <Website value={leadInfo.website} />
            </CardFooter>
        </Card>
    );
}
