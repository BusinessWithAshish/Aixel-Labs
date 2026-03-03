'use client';

import { useCallback } from 'react';
import { ChatInterface } from '@/components/common/ChatInterface';
import { cn } from '@/lib/utils';
import type { GMAPS_SCRAPE_REQUEST } from '@aixellabs/shared/gmaps';
import { usePage } from '@/contexts/PageStore';
import { type UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';

function normalizeRequest(data: Record<string, unknown>): GMAPS_SCRAPE_REQUEST {
    return {
        query: (data.query as string) ?? '',
        country: (data.country as string) ?? '',
        state: (data.state as string) ?? '',
        cities: Array.isArray(data.cities) ? data.cities : [],
        urls: Array.isArray(data.urls) ? data.urls : [],
    };
}

export function GoogleMapsScraperChat() {
    const { form, onSubmit } = usePage<UseGoogleMapsFormReturn>();

    const handleConfirm = useCallback(
        async (data: Record<string, unknown>) => {
            const normalized = normalizeRequest(data);
            form.reset(normalized);
            await onSubmit(normalized);
        },
        [form, onSubmit],
    );

    return (
        <div className={cn('flex flex-col h-full')}>
            <ChatInterface
                taskType="google-maps"
                assistantName="Google Maps Leads Finder"
                placeholder="Tell me what businesses you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                onConfirm={handleConfirm}
            />
        </div>
    );
}
