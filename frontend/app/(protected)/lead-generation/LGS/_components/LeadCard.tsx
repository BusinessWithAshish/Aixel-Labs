'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExternalLink, Phone, Star, MessageSquare } from 'lucide-react';
import { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/apis';

type LeadType = {
    type: string;
    color: string;
};

const getLeadType = (lead: GMAPS_SCRAPE_LEAD_INFO): LeadType => {
    const hasWebsite = lead.website && lead.website !== 'N/A';
    const hasPhone = lead.phoneNumber && lead.phoneNumber !== 'N/A';

    if (!hasWebsite && hasPhone) return { type: 'Hot Lead', color: 'bg-green-50 border-green-200' };
    if (hasWebsite && hasPhone) return { type: 'Warm Lead', color: 'bg-amber-50 border-amber-200' };
    if (!hasWebsite && !hasPhone) return { type: 'Cold Lead', color: 'bg-gray-50 border-gray-200' };
    return { type: 'Unknown', color: 'bg-white border-gray-200' };
};

export const LeadCard = ({ lead }: { lead: GMAPS_SCRAPE_LEAD_INFO }) => {
    const leadType = getLeadType(lead);

    const handleWebsiteClick = () => {
        if (lead.website && lead.website !== 'N/A') {
            window.open(lead.website, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <Card className={cn('transition-all duration-200 hover:shadow-md h-full flex flex-col', leadType.color)}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg font-semibold truncate" title={lead.name}>
                            {lead.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 sm:gap-2 mt-1 text-xs sm:text-sm flex-wrap">
                            <div className="flex items-center gap-1 shrink-0">
                                <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 fill-current" />
                                <span className="font-medium">{lead.overAllRating}</span>
                            </div>
                            <span className="text-gray-400 shrink-0">•</span>
                            <div className="flex items-center gap-1 min-w-0">
                                <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
                                <span className="truncate">{lead.numberOfReviews} reviews</span>
                            </div>
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs px-2 py-0.5 sm:py-1 whitespace-nowrap">
                        {leadType.type}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-2.5 sm:space-y-3 flex-1">
                <div className="flex items-start gap-2 sm:gap-3">
                    <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                        {lead.website && lead.website !== 'N/A' ? (
                            <button
                                onClick={handleWebsiteClick}
                                className="text-blue-600 hover:text-blue-800 hover:underline truncate block w-full text-left text-xs sm:text-sm"
                                title={lead.website}
                            >
                                {lead.website}
                            </button>
                        ) : (
                            <span className="text-gray-500 italic text-xs sm:text-sm">No website</span>
                        )}
                    </div>
                </div>

                <div className="flex items-start gap-2 sm:gap-3">
                    <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                        {lead.phoneNumber && lead.phoneNumber !== 'N/A' ? (
                            <a
                                href={`tel:${lead.phoneNumber}`}
                                className="text-gray-700 hover:text-gray-900 hover:underline truncate block text-xs sm:text-sm"
                                title={lead.phoneNumber}
                            >
                                {lead.phoneNumber}
                            </a>
                        ) : (
                            <span className="text-gray-500 italic text-xs sm:text-sm">No phone number</span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
