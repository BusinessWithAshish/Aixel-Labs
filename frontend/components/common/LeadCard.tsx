'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExternalLink, Phone, Star, MessageSquare, MapPin, Copy } from 'lucide-react';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';
import { copyPhoneNumber } from '@/lib/clipboard';
import { useState } from 'react';
import type { ReactNode } from 'react';

const DEFAULT_DISPLAY_VALUE = 'N/A';

type LeadType = {
    type: string;
    color: string;
};

type LeadCardProps = {
    lead: GMAPS_SCRAPE_LEAD_INFO;
    leadType?: LeadType;
    actions?: ReactNode;
    className?: string;
};

const getLeadType = (lead: GMAPS_SCRAPE_LEAD_INFO): LeadType => {
    const hasWebsite = lead.website !== null && lead.website !== undefined && lead.website !== '';
    const hasPhone = lead.phoneNumber !== null && lead.phoneNumber !== undefined && lead.phoneNumber !== '';

    if (hasWebsite && hasPhone) {
        return { type: 'Premium', color: 'border-l-4 border-l-green-500' };
    }
    if (hasWebsite || hasPhone) {
        return { type: 'Standard', color: 'border-l-4 border-l-blue-500' };
    }
    return { type: 'Basic', color: 'border-l-4 border-l-gray-400' };
};

const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO) => {
    return lead.website !== null && lead.website !== undefined && lead.website !== '';
};

const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO) => {
    return lead.phoneNumber !== null && lead.phoneNumber !== undefined && lead.phoneNumber !== '';
};

export const LeadCard = ({ lead, leadType, actions, className }: LeadCardProps) => {
    const computedLeadType = leadType || getLeadType(lead);
    const [isPhoneHovered, setIsPhoneHovered] = useState(false);

    const handleWebsiteClick = () => {
        if (hasWebsite(lead)) {
            window.open(lead.website ?? '', '_blank', 'noopener,noreferrer');
        }
    };

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
        <Card className={cn('transition-all duration-200 hover:shadow-md', computedLeadType.color, className)}>
            <CardHeader className="pb-3">
                <div className="flex items-start overflow-hidden justify-between gap-2">
                    <div className="w-3/5 truncate text-ellipsis">
                        <CardTitle className="text-lg font-semibold" title={lead.name ?? DEFAULT_DISPLAY_VALUE}>
                            {lead.name ?? DEFAULT_DISPLAY_VALUE}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 sm:gap-2 mt-1.5 text-xs sm:text-sm flex-wrap">
                            <div className="flex items-center gap-1 shrink-0">
                                <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 fill-current" />
                                <span title={lead.overAllRating ?? DEFAULT_DISPLAY_VALUE} className="font-medium">
                                    {lead.overAllRating ?? DEFAULT_DISPLAY_VALUE}
                                </span>
                            </div>
                            <span className="text-gray-400 shrink-0">•</span>
                            <div className="flex items-center gap-1 min-w-0">
                                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
                                <span title={lead.numberOfReviews ?? DEFAULT_DISPLAY_VALUE} className="truncate">
                                    {lead.numberOfReviews ?? DEFAULT_DISPLAY_VALUE} reviews
                                </span>
                            </div>
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            onClick={handleMapsClick}
                            variant="ghost"
                            size="icon"
                            className="group h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition-all duration-300 ease-in-out hover:scale-110 active:scale-95 border border-blue-200 hover:border-blue-300 hover:shadow-md"
                            title="Open in Google Maps"
                            aria-label="Open location in Google Maps"
                        >
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 group-hover:text-blue-700 transition-colors duration-300" />
                        </Button>
                        <Badge variant="secondary" className="text-xs px-2 py-1">
                            {computedLeadType.type}
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0 px-4 sm:px-6 pb-4 sm:pb-6 space-y-2.5 sm:space-y-3 flex-1">
                <div className="flex items-start gap-2 sm:gap-3">
                    <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 overflow-hidden">
                        {hasWebsite(lead) ? (
                            <button
                                onClick={handleWebsiteClick}
                                className="text-blue-600 hover:text-blue-800 hover:underline truncate block w-full text-left text-xs sm:text-sm"
                                title={lead.website ?? DEFAULT_DISPLAY_VALUE}
                            >
                                {lead.website ?? DEFAULT_DISPLAY_VALUE}
                            </button>
                        ) : (
                            <span className="text-gray-500 italic text-xs sm:text-sm">No website</span>
                        )}
                    </div>
                </div>

                <div
                    className="flex items-start gap-2 sm:gap-3 group/phone"
                    onMouseEnter={() => setIsPhoneHovered(true)}
                    onMouseLeave={() => setIsPhoneHovered(false)}
                >
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-2">
                        {hasPhone(lead) ? (
                            <>
                                <a
                                    href={`tel:${lead.phoneNumber}`}
                                    className="text-gray-700 hover:text-gray-900 hover:underline truncate block text-xs sm:text-sm"
                                    title={lead.phoneNumber ?? DEFAULT_DISPLAY_VALUE}
                                >
                                    {lead.phoneNumber ?? DEFAULT_DISPLAY_VALUE}
                                </a>
                                <Button
                                    onClick={handleCopyPhone}
                                    variant="ghost"
                                    size="icon"
                                    className={cn(
                                        'h-6 w-6 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-all duration-200 shrink-0',
                                        'opacity-100 sm:opacity-0 sm:group-hover/phone:opacity-100',
                                        isPhoneHovered && 'sm:scale-110',
                                    )}
                                    title="Copy phone number"
                                    aria-label="Copy phone number to clipboard"
                                >
                                    <Copy className="w-3.5 h-3.5 text-gray-600 hover:text-gray-900" />
                                </Button>
                            </>
                        ) : (
                            <span className="text-gray-500 italic text-xs sm:text-sm">No phone number</span>
                        )}
                    </div>
                </div>

                {actions && <div className="pt-2 border-t flex gap-2">{actions}</div>}
            </CardContent>
        </Card>
    );
};
