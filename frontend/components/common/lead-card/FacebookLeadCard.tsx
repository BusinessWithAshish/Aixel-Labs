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
import { BadgeCheck, MapPin, Trash2 } from 'lucide-react';
import { Email, PhoneNumberList, Website } from '@/components/common/lead-card/ExternalContacts';
import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { FACEBOOK_RESPONSE } from '@aixellabs/backend/facebook';
import { Checkbox } from '@/components/ui/checkbox';

const DEFAULT_DISPLAY_VALUE = 'N/A';
const FACEBOOK_BLUE = '#1877F2';

type FacebookLeadCardProps = {
    lead: FACEBOOK_RESPONSE;
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

export function FacebookLeadCard(props: FacebookLeadCardProps) {
    const { lead, className, actions, showCheckbox, onDelete, onSelect, isSelected } = props;

    const leadInfo = useMemo(() => {
        return {
            name: lead.name?.trim() || DEFAULT_DISPLAY_VALUE,
            facebookUrl: lead.facebookUrl ?? null,
            category: lead.category?.trim() || null,
            website: lead.website ?? null,
            phone: lead.phone ?? null,
            emails: lead.emails ?? [],
            address: lead.address?.trim() || null,
            followers: lead.followers,
            likes: lead.likes,
            verified: lead.verified === true,
            profileImageUrl: lead.profileImageUrl ?? undefined,
            bio: lead.bio?.trim() || DEFAULT_DISPLAY_VALUE,
        };
    }, [lead]);

    const [bioExpanded, setBioExpanded] = useState(false);
    const [bioOverflows, setBioOverflows] = useState(false);
    const bioRef = useRef<HTMLParagraphElement>(null);

    useLayoutEffect(() => {
        if (bioExpanded) return;
        const el = bioRef.current;
        if (!el || leadInfo.bio === DEFAULT_DISPLAY_VALUE || !leadInfo.bio.trim()) {
            setBioOverflows(false);
            return;
        }
        const checkOverflow = () => {
            setBioOverflows(el.scrollHeight > el.clientHeight + 1);
        };
        checkOverflow();
        const observer = new ResizeObserver(checkOverflow);
        observer.observe(el);
        return () => observer.disconnect();
    }, [leadInfo.bio, bioExpanded]);

    return (
        <Card
            className={cn(
                'relative h-fit min-h-[360px] w-full gap-3 overflow-y-auto py-2 transition-shadow hover:shadow-lg',
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
            <CardHeader className="flex items-center justify-between gap-2 text-center min-w-0 overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
                    <section className="flex min-w-0 w-full items-center gap-2">
                        {showCheckbox && onSelect && (
                            <Checkbox
                                className="shrink-0"
                                checked={isSelected}
                                onCheckedChange={onSelect}
                            />
                        )}
                        <Avatar className="size-10 shrink-0">
                            <AvatarImage
                                src={leadInfo.profileImageUrl}
                                alt={leadInfo.name}
                            />
                            <AvatarFallback className="text-lg">
                                {getInitials(leadInfo.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex items-start flex-col min-w-0 flex-1 overflow-hidden">
                            <CardTitle className="flex w-full min-w-0 max-w-full items-center gap-1.5">
                                <span className="min-w-0 flex-1 truncate">{leadInfo.name}</span>
                                {leadInfo.verified && (
                                    <Popover>
                                        <PopoverTrigger className="cursor-pointer shrink-0">
                                            <BadgeCheck
                                                className="size-5 text-white"
                                                style={{ fill: FACEBOOK_BLUE }}
                                            />
                                        </PopoverTrigger>
                                        <PopoverContent className="p-2 w-fit">
                                            <p className="text-sm">Verified Page</p>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </CardTitle>
                            {leadInfo.category && (
                                <CardDescription className="truncate">
                                    {leadInfo.category}
                                </CardDescription>
                            )}
                        </div>
                    </section>
                </div>

                <CardAction className="shrink-0">
                    {leadInfo.facebookUrl && (
                        <Button
                            onClick={() => window.open(leadInfo.facebookUrl!, '_blank')}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:scale-110 duration-100 transition-all rounded-full"
                            title="Open on Facebook"
                            aria-label="Open on Facebook"
                        >
                            <Image
                                src="/facebook-logo.svg"
                                alt="Facebook"
                                width={20}
                                height={20}
                            />
                        </Button>
                    )}
                </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-2 min-w-0 overflow-hidden">
                <dl className="flex items-center bg-muted-foreground/10 rounded-md p-2 justify-between gap-2 min-w-0 w-full">
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <dt className="text-sm font-semibold tabular-nums truncate w-full text-center">
                            {formatNumber(leadInfo.followers)}
                        </dt>
                        <dd className="text-xs text-muted-foreground truncate w-full text-center">
                            Followers
                        </dd>
                    </div>
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <dt className="text-sm font-semibold tabular-nums truncate w-full text-center">
                            {formatNumber(leadInfo.likes)}
                        </dt>
                        <dd className="text-xs text-muted-foreground truncate w-full text-center">
                            Likes
                        </dd>
                    </div>
                </dl>

                <div className="min-w-0">
                    <p
                        ref={bioRef}
                        className={cn(
                            'text-sm leading-relaxed text-muted-foreground wrap-break-words min-w-0',
                            !bioExpanded && 'line-clamp-3',
                        )}
                    >
                        {leadInfo.bio}
                    </p>
                    {bioOverflows && (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-sm font-medium"
                            onClick={() => setBioExpanded((e) => !e)}
                        >
                            {bioExpanded ? 'See less' : 'See more'}
                        </Button>
                    )}
                </div>

                {leadInfo.category && (
                    <Badge variant="secondary" className="rounded-full w-fit">
                        {leadInfo.category}
                    </Badge>
                )}

                {leadInfo.address && (
                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground min-w-0">
                        <MapPin className="size-4 shrink-0 mt-0.5" />
                        <span className="min-w-0 wrap-break-words">{leadInfo.address}</span>
                    </div>
                )}

                {actions && <div className="border-t">{actions}</div>}
            </CardContent>

            <CardFooter className="flex items-start flex-col gap-2 min-w-0 overflow-hidden">
                <CardDescription>Contact</CardDescription>
                {leadInfo.emails.map((email) => (
                    <Email key={email} value={email} hideWhenEmpty />
                ))}
                <PhoneNumberList
                    phoneNumbers={leadInfo.phone ? [leadInfo.phone] : []}
                />
                <Website value={leadInfo.website} />
            </CardFooter>
        </Card>
    );
}
