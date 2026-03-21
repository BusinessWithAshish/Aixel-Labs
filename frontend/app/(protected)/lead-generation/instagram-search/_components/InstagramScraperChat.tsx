'use client';

import { ChatInterface } from "@/components/common/ChatInterface";
import { usePage } from "@/contexts/PageStore";
import type { INSTAGRAM_REQUEST } from "@aixellabs/backend/instagram";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";

export const InstagramScraperChat = () => {
    const { onSubmit } = usePage<UseInstagramFormReturn>();
    return (
        <div className="flex flex-col h-full">
            <ChatInterface
                taskType="instagram"
                assistantName="Instagram Leads Finder"
                placeholder="Tell me what businesses/business accounts/leads in Instagram you're looking for..."
                emptyStateMessage="Hi! Tell me what type of businesses you'd like to find and where. For example: 'Find restaurants in Mumbai' or 'I need plumbers in New York'"
                confirmMode="manual"
                onConfirm={(data) => onSubmit(data as INSTAGRAM_REQUEST)}
            />
        </div>
    );
};