'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgeCheck, LucideIcon, Trash2 } from "lucide-react";
import { Email, PhoneNumber, WebsiteList } from "@/components/common/lead-card/ExternalContacts";
import { ReactNode, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { INSTAGRAM_RESPONSE } from "@aixellabs/backend/instagram";
import { Checkbox } from "@/components/ui/checkbox";

const DEFAULT_DISPLAY_VALUE = 'N/A';

const ProfileBadgePopover = ({ message, Icon, className }: { message: string, Icon: LucideIcon, className?: string }) => {
    return (
        <Popover>
            <PopoverTrigger className="cursor-pointer">
                <Icon className={cn("size-5", className)} />
            </PopoverTrigger>
            <PopoverContent className="p-2 w-fit">
                <p className="text-sm">{message}</p>
            </PopoverContent>
        </Popover>
    );
};

type InstagramLeadCardProps = {
    lead: INSTAGRAM_RESPONSE;
    className?: string;
    actions?: ReactNode;
    showCheckbox?: boolean;
    onDelete?: () => void;
    onSelect?: (selected: boolean) => void;
    isSelected?: boolean;
};

export const InstagramLeadCard = (props: InstagramLeadCardProps) => {

    const { lead, className, actions, showCheckbox, onDelete, onSelect, isSelected } = props;

    const leadInfo = useMemo(() => {
        return {
            fullName: lead.fullName ?? DEFAULT_DISPLAY_VALUE,
            username: lead.username ?? DEFAULT_DISPLAY_VALUE,
            instagramUrl: lead.instagramUrl ?? DEFAULT_DISPLAY_VALUE,
            websites: lead.websites ?? [],
            bio: lead.bio ?? DEFAULT_DISPLAY_VALUE,
            bioHashtags: lead.bioHashtags ?? [],
            bioMentions: lead.bioMentions ?? [],
            followers: lead.followers ?? 0,
            following: lead.following ?? 0,
            posts: lead.posts ?? 0,
            profilePicture: lead.profilePicture ?? undefined,
            profilePictureHd: lead.profilePictureHd ?? undefined,
            isVerified: lead.isVerified ?? false,
            isBusiness: lead.isBusiness ?? false,
            isProfessional: lead.isProfessional ?? false,
            isPrivate: lead.isPrivate ?? false,
            isJoinedRecently: lead.isJoinedRecently ?? false,
            businessEmail: lead.businessEmail ?? DEFAULT_DISPLAY_VALUE,
            businessPhoneNumber: lead.businessPhoneNumber ?? DEFAULT_DISPLAY_VALUE,
            businessCategoryName: lead.businessCategoryName ?? DEFAULT_DISPLAY_VALUE,
            overallCategoryName: lead.overallCategoryName ?? DEFAULT_DISPLAY_VALUE,
            businessAddressJson: lead.businessAddressJson ?? DEFAULT_DISPLAY_VALUE,
        };
    }, [lead]);

    const getInitials = (name: string) => {
        if (name === DEFAULT_DISPLAY_VALUE) return "?";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    const formatNumber = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    const getProfilePicture = (lead: typeof leadInfo) => {
        return lead.profilePictureHd || lead.profilePicture;
    };

    const [bioExpanded, setBioExpanded] = useState(false);
    const showBioToggle =
        leadInfo.bio !== DEFAULT_DISPLAY_VALUE && leadInfo.bio.trim().length > 0 && leadInfo.bio.length > 100;

    return (
        <Card
            className={cn(
                "relative h-fit min-h-[400px] w-full gap-3 overflow-y-auto py-2 transition-shadow hover:shadow-lg",
                isSelected && "ring-2 ring-primary",
                className,
            )}>
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
                            <Checkbox className="shrink-0" checked={isSelected} onCheckedChange={onSelect} />
                        )}
                        <Avatar className="size-10 shrink-0">
                            <AvatarImage
                                src={getProfilePicture(leadInfo) ?? undefined}
                                alt={leadInfo.fullName}
                            />
                            <AvatarFallback className="text-lg">{getInitials(leadInfo.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex items-start flex-col min-w-0 flex-1 overflow-hidden">
                            <CardTitle className="flex w-full min-w-0 max-w-full items-center gap-1.5">
                                <span className="min-w-0 flex-1 truncate">{leadInfo.fullName}</span>
                            </CardTitle>
                            <CardDescription className="truncate">
                                @{leadInfo.username}
                                {leadInfo.isVerified && (
                                    <ProfileBadgePopover message="Profile Verified" Icon={BadgeCheck} className="text-white fill-blue-500 shrink-0" />
                                )}
                            </CardDescription>
                        </div>
                    </section>

                    <section className="flex flex-wrap items-start gap-2">
                        {lead.isBusiness && (
                            <Badge size="sm" variant="yellow" className="rounded-full">
                                Business
                            </Badge>
                        )}

                        {lead.isProfessional && (
                            <Badge size="sm" variant="green" className="rounded-full">
                                Professional
                            </Badge>
                        )}
                        {lead.isJoinedRecently && (
                            <Badge size="sm" variant="blue" className="rounded-full">
                                Joined Recently
                            </Badge>
                        )}
                        {lead.isPrivate && (
                            <Badge size="sm" variant="red" className="rounded-full">
                                Private
                            </Badge>
                        )}
                    </section>

                    <section className="flex items-center flex-wrap gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {leadInfo.bioHashtags.map((hashtag) => (
                                <Badge key={hashtag} variant="secondary" className="rounded-full">
                                    {hashtag}
                                </Badge>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {leadInfo.bioMentions.map((mention) => (
                                <Badge key={mention} variant="secondary" className="rounded-full">
                                    {mention}
                                </Badge>
                            ))}
                        </div>
                    </section>

                </div>

                <CardAction className="shrink-0">
                    <Button
                        onClick={() => window.open(leadInfo.instagramUrl, '_blank')}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:scale-110 duration-100 transition-all rounded-full"
                        title="Open in Instagram"
                        aria-label="Open in Instagram"
                    >
                        <Image src="/instagram-logo.svg" alt="Instagram" width={20} height={20} />
                    </Button>
                </CardAction>

            </CardHeader>

            <CardContent className="flex flex-col gap-2 min-w-0 overflow-hidden">

                <dl className="flex items-center bg-muted-foreground/10 rounded-md p-2 justify-between gap-2 min-w-0 w-full">
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <dt className="text-sm font-semibold tabular-nums truncate w-full text-center">{formatNumber(leadInfo.followers)}</dt>
                        <dd className="text-xs text-muted-foreground truncate w-full text-center">Followers</dd>
                    </div>
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <dt className="text-sm font-semibold tabular-nums truncate w-full text-center">{formatNumber(leadInfo.following)}</dt>
                        <dd className="text-xs text-muted-foreground truncate w-full text-center">Following</dd>
                    </div>
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
                        <dt className="text-sm font-semibold tabular-nums truncate w-full text-center">{formatNumber(leadInfo.posts)}</dt>
                        <dd className="text-xs text-muted-foreground truncate w-full text-center">Posts</dd>
                    </div>
                </dl>

                <div className="min-w-0">
                    <p
                        className={cn(
                            "text-sm leading-relaxed text-muted-foreground wrap-break-words min-w-0",
                            !bioExpanded && "line-clamp-3",
                        )}
                    >
                        {leadInfo.bio}
                    </p>
                    {showBioToggle && (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-sm font-medium"
                            onClick={() => setBioExpanded((e) => !e)}
                        >
                            {bioExpanded ? "See less" : "See more"}
                        </Button>
                    )}
                </div>

                {leadInfo.businessCategoryName && (
                    <Badge key={leadInfo.businessCategoryName} variant="secondary" className="rounded-full">
                        Category: {leadInfo.businessCategoryName}
                    </Badge>
                )}

                {actions && <div className="border-t">{actions}</div>}

            </CardContent>

            <CardFooter className="flex items-start flex-col gap-2 min-w-0 overflow-hidden">
                <CardDescription>Business Details</CardDescription>
                <Email value={lead.businessEmail} hideWhenEmpty />
                <PhoneNumber value={lead.businessPhoneNumber} hideWhenEmpty />
                <WebsiteList websites={lead.websites ?? []} />
            </CardFooter>
        </Card>
    );
};
