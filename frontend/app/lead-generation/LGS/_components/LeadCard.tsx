"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Lead } from "@/app/lead-generation/LGS/_utlis/types";
import { ExternalLink, Phone, Star, MessageSquare } from "lucide-react";

interface LeadCardProps {
  lead: Lead;
}

export const LeadCard = ({ lead }: LeadCardProps) => {
  const getLeadType = () => {
    const hasWebsite = lead.website && lead.website !== 'N/A';
    const hasPhone = lead.phoneNumber && lead.phoneNumber !== 'N/A';
    
    if (!hasWebsite && hasPhone) return { type: "Hot Lead", color: "bg-green-50 border-green-200" };
    if (hasWebsite && hasPhone) return { type: "Warm Lead", color: "bg-amber-50 border-amber-200" };
    if (!hasWebsite && !hasPhone) return { type: "Cold Lead", color: "bg-gray-50 border-gray-200" };
    return { type: "Unknown", color: "bg-white border-gray-200" };
  };

  const leadType = getLeadType();

  const handleWebsiteClick = () => {
    if (lead.website && lead.website !== 'N/A') {
      window.open(lead.website, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card className={cn("transition-all duration-200 hover:shadow-md", leadType.color)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate" title={lead.name}>
              {lead.name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1 text-sm">
              <Star className="w-4 h-4 text-yellow-500 fill-current shrink-0" />
              <span className="font-medium">{lead.overAllRating}</span>
              <span className="text-gray-400 shrink-0">•</span>
              <MessageSquare className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="truncate">{lead.numberOfReviews} reviews</span>
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs px-2 py-1">
            {leadType.type}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ExternalLink className="w-4 h-4 text-gray-500 shrink-0" />
            <div className="min-w-0 flex-1">
              {lead.website && lead.website !== 'N/A' ? (
                <button
                  onClick={handleWebsiteClick}
                  className="text-blue-600 hover:text-blue-800 hover:underline truncate block w-full text-left"
                  title={lead.website}
                >
                  {lead.website}
                </button>
              ) : (
                <span className="text-gray-500 italic">No website</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Phone className="w-4 h-4 text-gray-500 shrink-0" />
            <div className="min-w-0 flex-1">
              {lead.phoneNumber && lead.phoneNumber !== 'N/A' ? (
                <a 
                  href={`tel:${lead.phoneNumber}`}
                  className="text-gray-700 hover:text-gray-900 hover:underline truncate block"
                  title={lead.phoneNumber}
                >
                  {lead.phoneNumber}
                </a>
              ) : (
                <span className="text-gray-500 italic">No phone number</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
