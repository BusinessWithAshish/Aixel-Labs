'use client';

import { useCallback } from 'react';
import { ChatInterface } from '@/components/common/ChatInterface';
import { cn } from '@/lib/utils';
import { GMAPS_SCRAPE_REQUEST_SCHEMA, type GMAPS_SCRAPE_REQUEST } from '@aixellabs/shared/common/apis';
import { usePage } from '@/contexts/PageStore';
import { type UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';
import { toast } from 'sonner';

/** Normalize chat-extracted data to match form schema (arrays, optional strings). */
function normalizeRequest(data: Partial<GMAPS_SCRAPE_REQUEST>): GMAPS_SCRAPE_REQUEST {
    return {
        query: data.query ?? '',
        country: data.country ?? '',
        state: data.state ?? '',
        cities: Array.isArray(data.cities) ? data.cities : [],
        urls: Array.isArray(data.urls) ? data.urls : [],
    };
}

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

export function GoogleMapsScraperChat() {
    const { form, onSubmit } = usePage<UseGoogleMapsFormReturn>();

    const handleConfirm = useCallback(
        async (data: Partial<GMAPS_SCRAPE_REQUEST>) => {
            try {
                const normalized = normalizeRequest(data);
                // Sync form state so the Results tab and Manual Form tab show the chat data
                form.reset(normalized);
                // Submit the chat-validated data directly so we don't depend on form
                // validation (which can have stale errors or async reset timing issues)
                await onSubmit(normalized);
                toast.success('Leads are ready! Check the Results tab.');
            } catch (err) {
                console.error('Start Now failed:', err);
                toast.error('Something went wrong. Please try again.');
            }
        },
        [form, onSubmit],
    );

    return (
        <div className={cn('flex flex-col h-full')}>
            <ChatInterface<GMAPS_SCRAPE_REQUEST>
                assistantName="Google Maps Leads Finder"
                assistantDescription="Find business leads from Google Maps"
                placeholder="Tell me what businesses you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                systemPrompt={GOOGLE_MAPS_SYSTEM_PROMPT}
                outputSchema={GMAPS_SCRAPE_REQUEST_SCHEMA}
                messagesPersistKey="google-maps-scraper-chat-messages"
                onConfirm={handleConfirm}
            />
        </div>
    );
}
