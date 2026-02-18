'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Phone, Star, MessageSquare, Copy, Trash2, Globe } from 'lucide-react';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';
import { copyPhoneNumber } from '@/lib/clipboard';
import { useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { hasWebsite, hasPhone } from './lead-utils';
import ConditionalRendering from '../ConditionalRendering';
import { Else, If } from '../ConditionalRendering';

const DEFAULT_DISPLAY_VALUE = 'N/A';

type LeadCardProps = {
    lead: GMAPS_SCRAPE_LEAD_INFO;
    actions?: ReactNode;
    className?: string;
    onDelete?: () => void;
    showCheckbox?: boolean;
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
};

export const CommonLeadCard = ({
    lead,
    actions,
    className,
    onDelete,
    showCheckbox,
    isSelected,
    onSelect,
}: LeadCardProps) => {
    const [isPhoneHovered, setIsPhoneHovered] = useState(false);

    const handleMapsClick = () => {
        if (lead.gmapsUrl) {
            window.open(lead.gmapsUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCopyPhone = async () => {
        if (hasPhone(lead)) {
            await copyPhoneNumber(lead.phoneNumber ?? '');
        }
    };

    return (
        <Card
            className={cn(
                'transition-shadow min-h-[250px] hover:shadow-lg relative',
                isSelected && 'ring-2 ring-primary',
                className,
            )}
        >
            {onDelete && (
                <div className="absolute bottom-4 right-4 z-10">
                    <Button
                        onClick={onDelete}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                        title="Delete lead"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )}

            <CardHeader className="space-y-2 overflow-hidden">
                <CardTitle
                    className="flex w-full items-center gap-2 text-wrap wrap-break-word"
                    title={lead.name ?? DEFAULT_DISPLAY_VALUE}
                >
                    {showCheckbox && onSelect && <Checkbox checked={isSelected} onCheckedChange={onSelect} />}
                    <span className="text-lg text-foreground font-semibold" title={lead.name ?? DEFAULT_DISPLAY_VALUE}>
                        {lead.name ?? DEFAULT_DISPLAY_VALUE}
                    </span>
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 dark:text-yellow-400 dark:fill-yellow-400" />
                        <span className="font-medium">{lead.overAllRating ?? DEFAULT_DISPLAY_VALUE}/5.0</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <span>{lead.numberOfReviews ?? DEFAULT_DISPLAY_VALUE} reviews</span>
                    </div>
                </CardDescription>

                <CardAction className="flex items-center gap-2">
                    <Button
                        onClick={handleMapsClick}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:scale-110 duration-100 transition-all rounded-full"
                        title="Open in Google Maps"
                        aria-label="Open location in Google Maps"
                    >
                        <Image src="/google-maps.svg" alt="Google Maps" width={20} height={20} />
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="space-y-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <ConditionalRendering>
                        <If condition={hasWebsite(lead)}>
                            <a
                                href={lead.website ?? ''}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground truncate text-sm hover:text-primary hover:underline"
                            >
                                {lead.website ?? ''}
                            </a>
                        </If>
                        <Else>
                            <span className="text-muted-foreground italic text-sm">No website</span>
                        </Else>
                    </ConditionalRendering>
                </div>

                <div
                    className="flex items-center gap-3 group/phone"
                    onMouseEnter={() => setIsPhoneHovered(true)}
                    onMouseLeave={() => setIsPhoneHovered(false)}
                >
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                        <ConditionalRendering>
                            <If condition={hasPhone(lead)}>
                                <a
                                    href={`tel:${lead.phoneNumber}`}
                                    className="text-foreground hover:text-primary hover:underline truncate text-sm"
                                    title={lead.phoneNumber ?? DEFAULT_DISPLAY_VALUE}
                                >
                                    {lead.phoneNumber ?? DEFAULT_DISPLAY_VALUE}
                                </a>
                                <Button
                                    onClick={handleCopyPhone}
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        'h-6 w-6 rounded-md hover:bg-muted transition-all shrink-0',
                                        'opacity-100 sm:opacity-0 sm:group-hover/phone:opacity-100',
                                        isPhoneHovered && 'sm:scale-110',
                                    )}
                                    title="Copy phone number"
                                    aria-label="Copy phone number to clipboard"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                </Button>
                            </If>
                            <Else>
                                <span className="text-muted-foreground italic text-sm">No phone number</span>
                            </Else>
                        </ConditionalRendering>
                    </div>
                </div>

                {actions && <div className="border-t">{actions}</div>}
            </CardContent>
        </Card>
    );
};
