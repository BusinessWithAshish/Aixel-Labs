'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Star, MessageSquare, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import { Badge } from '@/components/ui/badge';
import { Website, PhoneNumber } from './ExternalContacts';

const DEFAULT_DISPLAY_VALUE = 'N/A';

type LeadCardProps = {
    data: GMAPS_INTERNAL_RESPONSE;
    actions?: ReactNode;
    className?: string;
    onDelete?: () => void;
    showCheckbox?: boolean;
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
};

export const GoogleMapLead = (props: LeadCardProps) => {
    const { data, actions, className, onDelete, showCheckbox, isSelected, onSelect } = props;

    const handleMapsClick = () => {
        if (data.gmapsUrl) {
            window.open(data.gmapsUrl, '_blank', 'noopener,noreferrer');
        }
    };
    return (
        <Card
            className={cn(
                'relative h-fit min-h-[180px] w-full gap-3 overflow-hidden transition-shadow hover:shadow-lg',
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

            <CardHeader className="min-w-0 gap-2">
                <CardTitle
                    className="min-w-0 flex w-full items-center gap-2 font-normal"
                    title={data.name ?? DEFAULT_DISPLAY_VALUE}
                >
                    {showCheckbox && onSelect && (
                        <Checkbox className="shrink-0" checked={isSelected} onCheckedChange={onSelect} />
                    )}
                    <span
                        className="min-w-0 flex-1 text-lg font-semibold text-foreground truncate"
                        title={data.name ?? DEFAULT_DISPLAY_VALUE}
                    >
                        {data.name ?? DEFAULT_DISPLAY_VALUE}
                    </span>
                </CardTitle>
                <CardDescription className="flex min-w-0 flex-col gap-2 font-normal">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex shrink-0 items-center gap-1">
                            <Star className="h-4 w-4 shrink-0 fill-yellow-500 text-yellow-500 dark:fill-yellow-400 dark:text-yellow-400" />
                            <span className="font-medium">
                                {data.rating != null ? `${data.rating}/5.0` : DEFAULT_DISPLAY_VALUE}
                            </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{data.reviewCount ?? DEFAULT_DISPLAY_VALUE} reviews</span>
                        </div>
                    </div>
                    {data.categories && data.categories.length > 0 && (
                        <div className="min-w-0 w-full max-w-full overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                            <div className="flex w-max flex-nowrap items-center gap-1.5">
                                {data.categories.map((category: string) => (
                                    <Badge key={category} variant="secondary" className="shrink-0 whitespace-nowrap rounded-full">
                                        {category}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </CardDescription>

                <CardAction className="shrink-0">
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

            <CardContent className="flex flex-col gap-2">
                <Website value={data.website} />
                <PhoneNumber value={data.phone} />

                {actions && <div className="border-t">{actions}</div>}
            </CardContent>
        </Card>
    );
};
