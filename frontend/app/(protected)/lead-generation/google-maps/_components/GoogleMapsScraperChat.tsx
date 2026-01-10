'use client';

import { useCallback } from 'react';
import { ChatInterface } from '@/components/common/ChatInterface';
import { cn } from '@/lib/utils';
import { GMAPS_SCRAPE_REQUEST_SCHEMA, type GMAPS_SCRAPE_REQUEST } from '@aixellabs/shared/common/apis';

const GOOGLE_MAPS_SYSTEM_PROMPT = `You are a friendly lead generation assistant helping users find business contacts from Google Maps.

Your personality:
- Warm and professional
- Efficient but not rushed
- Helpful and proactive

Your job is to naturally collect:
1. What type of business they're looking for (e.g., "restaurants", "plumbers", "dentists")
2. The location(s) to search - you need country, state/province, and city/cities

Smart location handling:
- When someone says "Mumbai", you know it's in Maharashtra, India
- When someone says "New York", you know it's in New York state, USA
- When they mention multiple cities, organize them by state
- Always confirm the location details if there's any ambiguity

Keep your responses short and conversational - 1-2 sentences is perfect!`;

type GoogleMapsScraperChatProps = {
    className?: string;
    onDataExtracted?: (data: GMAPS_SCRAPE_REQUEST) => void;
    onConfirm?: (data: GMAPS_SCRAPE_REQUEST) => void;
};

export function GoogleMapsScraperChat({ className, onDataExtracted, onConfirm }: GoogleMapsScraperChatProps) {

    const handleDataExtracted = useCallback(
        (data: GMAPS_SCRAPE_REQUEST) => {
            onDataExtracted?.(data);
        },
        [onDataExtracted],
    );

    const handleConfirm = useCallback(
        (data: GMAPS_SCRAPE_REQUEST) => {
            onConfirm?.(data);
        },
        [onConfirm],
    );

    return (
        <div className={cn('flex flex-col h-full', className)}>
            <ChatInterface<GMAPS_SCRAPE_REQUEST>
                assistantName="Google Maps Lead Finder"
                assistantDescription="Find business leads from Google Maps"
                placeholder="Tell me what businesses you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                systemPrompt={GOOGLE_MAPS_SYSTEM_PROMPT}
                outputSchema={GMAPS_SCRAPE_REQUEST_SCHEMA}
                onDataExtracted={handleDataExtracted}
                onConfirm={handleConfirm}
            />
        </div>
    );
}
