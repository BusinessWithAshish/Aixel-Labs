'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Star, Trash2, MapPin, Activity } from 'lucide-react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import type { GMAPS_DETAILS_RESPONSE } from '@aixellabs/backend/gmaps/details/types';
import { Badge } from '@/components/ui/badge';
import { Website, PhoneNumber } from './ExternalContacts';
import { gmapsProxiedImageUrl, pickGmapsCardPhotos } from '@/helpers/gmaps-image';

const DEFAULT_DISPLAY_VALUE = 'N/A';
const MAX_PHOTOS = 4;
const MAX_TOPICS = 8;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type LeadCardProps = {
    data: GMAPS_DETAILS_RESPONSE;
    actions?: ReactNode;
    className?: string;
    onDelete?: () => void;
    showCheckbox?: boolean;
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
};

function formatCount(n: number | null | undefined): string {
    if (n == null) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function todayPopularHours(data: GMAPS_DETAILS_RESPONSE) {
    const days = data.common.popularTimes;
    if (!days?.length) return null;
    const jsDay = new Date().getDay();
    const mapsIndex = jsDay === 0 ? 6 : jsDay - 1;
    const day = days.find((d) => d.dayIndex === mapsIndex) ?? days[mapsIndex] ?? days[0];
    if (!day?.hours?.length) return null;
    return day.hours.filter((h) => h.busyPercent != null && h.hour != null);
}

function isOpen24Hours(data: GMAPS_DETAILS_RESPONSE): boolean {
    const status = data.common.openStatus?.toLowerCase() ?? '';
    if (status.includes('24 hour')) return true;
    const hours = data.common.openingHours ?? [];
    if (hours.length === 0) return false;
    return hours.every((d) =>
        d.ranges.some((r) => (r.text ?? '').toLowerCase().includes('24 hour')),
    );
}

type OpenState = { label: string; isOpen: boolean | null };

function getOpenState(status: string | null): OpenState {
    if (!status?.trim()) return { label: '', isOpen: null };
    const firstSegment = status.split('·')[0].trim().toLowerCase();
    const isOpen = firstSegment.startsWith('open') && !firstSegment.startsWith('opens');
    const isClosed = firstSegment.startsWith('closed') || firstSegment.startsWith('closes');
    return { label: status.trim(), isOpen: isOpen ? true : isClosed ? false : null };
}

function PhotoStrip({ urls, name }: { urls: string[]; name: string }) {
    const [failed, setFailed] = useState<Record<string, boolean>>({});
    const visible = urls.filter((u) => !failed[u]);
    if (visible.length === 0) return null;

    return (
        <div
            className={cn(
                'grid gap-0.5 bg-muted',
                visible.length === 1 && 'grid-cols-1',
                visible.length === 2 && 'grid-cols-2',
                visible.length >= 3 && 'grid-cols-4',
            )}
        >
            {visible.map((src, index) => {
                const proxied = gmapsProxiedImageUrl(src) ?? src;
                return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        key={src}
                        src={proxied}
                        alt={index === 0 ? name : ''}
                        className={cn(
                            'w-full object-cover bg-muted',
                            visible.length === 1 ? 'h-40' : 'h-24',
                            visible.length >= 3 && index === 0 && 'col-span-2 row-span-2 h-48',
                        )}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setFailed((prev) => ({ ...prev, [src]: true }))}
                    />
                );
            })}
        </div>
    );
}

export const GoogleMapsAdvancedLeadCard = (props: LeadCardProps) => {
    const { data, actions, className, onDelete, showCheckbox, isSelected, onSelect } = props;

    const openState = getOpenState(data.common.openStatus);
    const openStatus = openState.label || null;
    const address = data.address?.trim() || null;
    const editorial =
        data.common.editorialSummary?.trim() || data.common.editorialTitle?.trim() || null;
    const plusCode = data.common.plusCode?.trim() || null;
    const photoUrls = pickGmapsCardPhotos(data.common.photos, MAX_PHOTOS);
    const topics = (data.common.reviewTopics ?? []).slice(0, MAX_TOPICS);
    const popularHours = todayPopularHours(data);
    const open24 = isOpen24Hours(data);
    const weekHours = (data.common.openingHours ?? [])
        .filter((d) => d.dayIndex != null)
        .sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));

    return (
        <Card
            className={cn(
                'relative h-fit w-full gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg',
                isSelected && 'ring-2 ring-primary',
                className,
            )}
        >
            {onDelete && (
                <div className="absolute bottom-3 right-3 z-10">
                    <Button
                        onClick={onDelete}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-background/80 hover:bg-destructive/10 hover:text-destructive"
                        title="Delete lead"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <PhotoStrip urls={photoUrls} name={data.name ?? 'Place'} />

            <CardHeader className="min-w-0 space-y-3 p-4 pb-2">
                <div className="flex min-w-0 items-center gap-2.5">
                    {showCheckbox && onSelect && (
                        <Checkbox
                            className="shrink-0"
                            checked={isSelected}
                            onCheckedChange={onSelect}
                        />
                    )}
                    <CardTitle className="min-w-0 flex-1 truncate text-base font-semibold leading-snug text-foreground">
                        <span title={data.name ?? DEFAULT_DISPLAY_VALUE}>
                            {data.name ?? DEFAULT_DISPLAY_VALUE}
                        </span>
                    </CardTitle>
                    {data.gmapsUrl && (
                        <a
                            href={data.gmapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0"
                            title="Open in Google Maps"
                            aria-label="Open location in Google Maps"
                        >
                            <Image
                                src="/google-maps.svg"
                                alt="Google Maps"
                                width={18}
                                height={18}
                                className="block"
                            />
                        </a>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {openStatus && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <span
                                className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    openState.isOpen === true &&
                                        'bg-emerald-500',
                                    openState.isOpen === false && 'bg-rose-500',
                                    openState.isOpen === null &&
                                        'bg-muted-foreground',
                                )}
                            />
                            <span
                                className={cn(
                                    openState.isOpen === true &&
                                        'text-emerald-600 dark:text-emerald-400',
                                    openState.isOpen === false &&
                                        'text-rose-600 dark:text-rose-400',
                                    openState.isOpen === null &&
                                        'text-muted-foreground',
                                )}
                            >
                                {openStatus}
                            </span>
                        </span>
                    )}
                    {data.rating != null && (
                        <span className="inline-flex items-center gap-1">
                            <span className="flex items-center gap-0.5 text-amber-500">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                        key={i}
                                        className={cn(
                                            'h-3.5 w-3.5',
                                            i < Math.round(data.rating!)
                                                ? 'fill-amber-500 text-amber-500'
                                                : 'fill-transparent text-muted-foreground/40',
                                        )}
                                    />
                                ))}
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                                {data.rating.toFixed(1)}
                            </span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                        <span className="font-semibold text-foreground">
                            {formatCount(data.reviewCount)}
                        </span>{' '}
                        reviews
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="tabular-nums">
                        <span className="font-semibold text-foreground">
                            {formatCount(
                                data.common.photos?.length
                                    ? data.common.photos.length
                                    : null,
                            )}
                        </span>{' '}
                        photos
                    </span>
                </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
                {address && (
                    <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0 space-y-0.5">
                            <p className="line-clamp-2 leading-relaxed text-foreground/90">
                                {address}
                            </p>
                            {plusCode && (
                                <p className="text-xs tabular-nums text-muted-foreground">
                                    {plusCode}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {editorial && (
                    <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{editorial}</p>
                )}

                {data.categories && data.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {data.categories.map((category) => (
                            <Badge key={category} variant="secondary" className="rounded-md font-normal">
                                {category}
                            </Badge>
                        ))}
                    </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                    <Website value={data.website} />
                    <PhoneNumber value={data.phone} />
                </div>

                {popularHours && popularHours.length > 0 && (
                    <div className="space-y-2 rounded-lg border px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">Popular today</p>
                            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex h-14 items-end gap-px">
                            {popularHours.map((h) => {
                                const pct = h.busyPercent ?? 0;
                                return (
                                    <div
                                        key={`${h.hour}-${h.timeLabel}`}
                                        className={cn(
                                            'min-w-0 flex-1 rounded-t-sm',
                                            pct >= 70
                                                ? 'bg-orange-500/80'
                                                : pct >= 40
                                                  ? 'bg-amber-500/70'
                                                  : 'bg-primary/45',
                                        )}
                                        style={{ height: `${Math.max(6, pct)}%` }}
                                        title={h.label ?? h.timeLabel ?? `${h.hour}:00`}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                {(open24 || weekHours.length > 0) && (
                    <div className="space-y-2 rounded-lg border px-3 py-2.5">
                        <p className="text-xs font-medium text-muted-foreground">Hours</p>
                        {open24 ? (
                            <p className="text-sm font-medium text-foreground">Open 24 hours</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                {weekHours.map((d) => {
                                    const label =
                                        d.dayIndex != null && d.dayIndex >= 0 && d.dayIndex < 7
                                            ? DAY_LABELS[d.dayIndex]
                                            : d.day;
                                    const range =
                                        d.ranges.map((r) => r.text).filter(Boolean).join(', ') || '—';
                                    return (
                                        <div
                                            key={`${d.dayIndex}-${d.day}`}
                                            className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
                                        >
                                            <span className="shrink-0 font-medium text-muted-foreground">
                                                {label}
                                            </span>
                                            <span className="truncate text-right text-foreground/90">
                                                {range}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {topics.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Mentioned in reviews</p>
                        <div className="flex flex-wrap gap-1.5">
                            {topics.map((t) => (
                                <Badge
                                    key={t.id ?? t.topic}
                                    variant="outline"
                                    className="rounded-full border-dashed font-normal"
                                >
                                    {t.topic}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}

                {actions && <div className="border-t pt-2">{actions}</div>}
            </CardContent>
        </Card>
    );
};
