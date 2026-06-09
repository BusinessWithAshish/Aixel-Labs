'use client';

import { ChatInterface } from '@/components/common/ai-chat-interface/ChatInterface';
import { usePage } from '@/contexts/PageStore';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { type UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';
import type { GMAPS_INTERNAL_REQUEST } from '@aixellabs/backend/gmaps/internal/types';

export function GoogleMapsScraperChat() {
    const { onSubmit } = usePage<UseGoogleMapsFormReturn>();

    return (
        <ChatInterface
            assistantName="Google Maps Leads Finder"
            placeholder="Tell me what businesses you're looking for..."
            emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
            name={LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS}
            onConfirm={(data) => {
                void onSubmit(data as GMAPS_INTERNAL_REQUEST);
            }}
        />
    );
}
