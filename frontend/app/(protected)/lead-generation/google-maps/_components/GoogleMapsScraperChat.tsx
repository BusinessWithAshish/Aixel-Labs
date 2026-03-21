'use client';

import { ChatInterface } from '@/components/common/ChatInterface';
import { cn } from '@/lib/utils';
import { usePage } from '@/contexts/PageStore';
import { type UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';

export function GoogleMapsScraperChat() {
    const { onSubmit } = usePage<UseGoogleMapsFormReturn>();

    return (
        <div className={cn('flex flex-col h-full')}>
            <ChatInterface
                taskType="google-maps"
                assistantName="Google Maps Leads Finder"
                placeholder="Tell me what businesses you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                confirmMode="manual"
                onConfirm={onSubmit}
            />
        </div>
    );
}
