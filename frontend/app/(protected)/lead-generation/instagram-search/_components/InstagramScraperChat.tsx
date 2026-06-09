'use client';

import { ChatInterface } from '@/components/common/ai-chat-interface/ChatInterface';
import { usePage } from '@/contexts/PageStore';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { INSTAGRAM_REQUEST } from '@aixellabs/backend/instagram';
import { UseInstagramFormReturn } from '../_hooks/use-instagram-form';

export const InstagramScraperChat = () => {
    const { onSubmit } = usePage<UseInstagramFormReturn>();
    return (
            <ChatInterface
                name={LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH}
                assistantName="Instagram Leads Finder"
                placeholder="Tell me what businesses/business accounts/leads in Instagram you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                onConfirm={(data) => {
                    void onSubmit(data as INSTAGRAM_REQUEST);
                }}
            />
    );
};