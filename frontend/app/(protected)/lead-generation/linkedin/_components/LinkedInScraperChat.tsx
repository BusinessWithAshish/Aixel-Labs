'use client';

import { ChatInterface } from '@/components/common/ai-chat-interface/ChatInterface';
import { usePage } from '@/contexts/PageStore';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { UseLinkedInFormReturn } from '../_hooks/use-linkedin-form';
import type { LINKEDIN_BY_PEOPLE_REQUEST } from '@aixellabs/backend/linkedin/types';

export const LinkedInScraperChat = () => {
    const { onSubmitPeople } = usePage<UseLinkedInFormReturn>();
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatInterface
                name={LEAD_GENERATION_SUB_MODULES.LINKEDIN}
                assistantName="LinkedIn Leads Finder"
                placeholder="Describe the people or companies you want to find on LinkedIn…"
                emptyStateMessage="Hi! Tell me who you are looking for — for example by role, industry, and location."
                onConfirm={(data) => {
                    void onSubmitPeople(data as LINKEDIN_BY_PEOPLE_REQUEST);
                }}
            />
        </div>
    );
};
