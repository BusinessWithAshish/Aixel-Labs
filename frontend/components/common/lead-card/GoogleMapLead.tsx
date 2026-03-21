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
import { ScrollArea } from '@radix-ui/react-scroll-area';
import { ScrollBar } from '@/components/ui/scroll-area';
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
                'transition-shadow gap-3 min-h-[180px] hover:shadow-lg relative',
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
                    className="flex w-full items-center gap-2 overflow-hidden"
                    title={data.name ?? DEFAULT_DISPLAY_VALUE}
                >
                    {showCheckbox && onSelect && <Checkbox checked={isSelected} onCheckedChange={onSelect} />}
                    <span className="text-lg text-foreground font-semibold truncate" title={data.name ?? DEFAULT_DISPLAY_VALUE}>
                        {data.name ?? DEFAULT_DISPLAY_VALUE}
                    </span>
                </CardTitle>
                <CardDescription className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 dark:text-yellow-400 dark:fill-yellow-400" />
                        <span className="font-medium">
                            {data.rating != null ? `${data.rating}/5.0` : DEFAULT_DISPLAY_VALUE}
                        </span>
                    </div>

                    <div className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <span>{data.reviewCount ?? DEFAULT_DISPLAY_VALUE} reviews</span>
                    </div>

                    <ScrollArea className="w-full">
                        {data.categories?.map((category: string) => (
                            <Badge key={category} variant="secondary" className="rounded-full shrink-0">
                                {category}
                            </Badge>
                        ))}
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
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

            <CardContent className="flex flex-col gap-2">
                <Website value={data.website} />
                <PhoneNumber value={data.phone} />

                {actions && <div className="border-t">{actions}</div>}
            </CardContent>
        </Card>
    );
};
