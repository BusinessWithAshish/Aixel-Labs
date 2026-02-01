import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO } from "@aixellabs/shared/common";
import { BadgeCheck, Mail, Store, Briefcase, LucideIcon, Phone, Globe } from "lucide-react";
import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import Image from "next/image";

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

export const InstagramLeadCard = ({ lead }: { lead: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO }) => {
    const leadInfo = useMemo(() => {
        return {
            fullName: lead.fullName ?? DEFAULT_DISPLAY_VALUE,
            username: lead.username ?? DEFAULT_DISPLAY_VALUE,
            email: lead.email ?? DEFAULT_DISPLAY_VALUE,
            instagramUrl: lead.instagramUrl ?? DEFAULT_DISPLAY_VALUE,
            websites: lead.websites ?? [],
            bio: lead.bio ?? DEFAULT_DISPLAY_VALUE,
            bioHashtags: lead.bioHashtags ?? [],
            bioMentions: lead.bioMentions ?? [],
            followers: lead.followers ?? 0,
            following: lead.following ?? 0,
            posts: lead.posts ?? 0,
            profilePicture: lead.profilePicture ?? DEFAULT_DISPLAY_VALUE,
            profilePictureHd: lead.profilePcitureHd ?? DEFAULT_DISPLAY_VALUE,
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

    const displayEmail = leadInfo.businessEmail !== DEFAULT_DISPLAY_VALUE
        ? leadInfo.businessEmail
        : leadInfo.email !== DEFAULT_DISPLAY_VALUE
            ? leadInfo.email
            : null;

    const categoryName = leadInfo.businessCategoryName !== DEFAULT_DISPLAY_VALUE
        ? leadInfo.businessCategoryName
        : leadInfo.overallCategoryName !== DEFAULT_DISPLAY_VALUE
            ? leadInfo.overallCategoryName
            : null;

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-wrap items-center justify-between text-center">
                <Avatar className="size-20">
                    <AvatarImage
                        src={leadInfo.profilePictureHd !== DEFAULT_DISPLAY_VALUE ? leadInfo.profilePictureHd : leadInfo.profilePicture !== DEFAULT_DISPLAY_VALUE ? leadInfo.profilePicture : undefined}
                        alt={leadInfo.fullName}
                    />
                    <AvatarFallback className="text-lg">{getInitials(leadInfo.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex items-start flex-col">
                    <CardTitle className="flex items-center gap-1.5">
                        {leadInfo.fullName}
                        {leadInfo.isVerified && (
                            <ProfileBadgePopover message="Profile Verified" Icon={BadgeCheck} className="text-white fill-blue-500" />
                        )}
                        {leadInfo.isBusiness && (
                            <ProfileBadgePopover message="Business Profile" Icon={Store} className="text-white fill-yellow-500" />
                        )}
                        {leadInfo.isProfessional && (
                            <ProfileBadgePopover message="Professional Profile" Icon={Briefcase} className="text-white fill-green-500" />
                        )}
                    </CardTitle>
                    <CardDescription>@{leadInfo.username}</CardDescription>
                </div>
                <CardAction>
                    <Button onClick={() => window.open(leadInfo.instagramUrl, '_blank')} variant="ghost" size="icon">
                        <Image src="/instagram-logo.svg" alt="Instagram" width={24} height={24} />
                        <span className="sr-only">View Profile</span>
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="flex border-t flex-col gap-4 p-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {leadInfo.bio}
                </p>
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

                <dl className="flex items-center bg-muted-foreground/10 rounded-md p-2 justify-evenly gap-6 w-full">
                    <div className="flex flex-col items-center gap-1">
                        <dt className="text-base font-semibold">{formatNumber(leadInfo.followers)}</dt>
                        <dd className="text-xs text-muted-foreground">Followers</dd>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <dt className="text-base font-semibold">{formatNumber(leadInfo.following)}</dt>
                        <dd className="text-xs text-muted-foreground">Following</dd>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <dt className="text-base font-semibold">{formatNumber(leadInfo.posts)}</dt>
                        <dd className="text-xs text-muted-foreground">Posts</dd>
                    </div>
                </dl>

                {categoryName && (
                    <Badge key={categoryName} variant="secondary" className="rounded-full">
                        {categoryName}
                    </Badge>
                )}
            </CardContent>

            <CardFooter className="flex items-start border-t pt-0 flex-col gap-2">
                <CardDescription>Business Details</CardDescription>
                <a
                    href={`mailto:${displayEmail}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                    <Mail className="size-4" />
                    {displayEmail}
                </a>
                <a
                    href={`tel:${leadInfo.businessPhoneNumber}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                    <Phone className="size-4" />
                    {leadInfo.businessPhoneNumber}
                </a>
                <div className="flex flex-col items-center gap-2">
                    {leadInfo.websites.map((website) => (
                        <a key={website} href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors">
                            <Globe className="size-4" />
                            {website}
                        </a>
                    ))}
                </div>
            </CardFooter>
        </Card>
    );
};