'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExternalLink, Phone, Star, MessageSquare } from 'lucide-react';
import { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/apis';
import { getLeadType, hasWebsite, hasPhone } from '../_utils';

export const LeadCard = ({ lead }: { lead: GMAPS_SCRAPE_LEAD_INFO }) => {
    const leadType = getLeadType(lead);

    const handleWebsiteClick = () => {
        if (hasWebsite(lead)) {
            window.open(lead.website, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <Card className={cn('transition-all duration-200 hover:shadow-md', leadType.color)}>
            <CardHeader className="pb-3">
                <div className="flex items-start overflow-hidden justify-between gap-2">
                    <div className="w-3/5 truncate text-ellipsis">
                        <CardTitle className="text-lg font-semibold" title={lead.name}>
                            {lead.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1.5 sm:gap-2 mt-1.5 text-xs sm:text-sm flex-wrap">
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
                    <Badge variant="secondary" className="shrink-0 text-xs px-2 py-1 w-2/5">
                        {leadType.type}
                    </Badge>
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
                    <div className="min-w-0 flex-1 overflow-hidden">
                        {hasPhone(lead) ? (
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
