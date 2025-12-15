'use client';

import { useState } from 'react';
import PageLayout from '@/components/common/PageLayout';
import {
    GenerateLeads,
    LeadGenerationProvider,
} from '@/app/(protected)/lead-generation/google-maps-scraper/_components';
import { GoogleMapsScraperChat } from '@/components/common/GoogleMapsScraperChat';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FormInput } from 'lucide-react';

function GoogleMapsScraperContent() {
    const [mode, setMode] = useState<'chat' | 'form'>('chat');

    return (
        <PageLayout className="space-y-4" title="Google Maps Scraper">
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'chat' | 'form')} className="h-full w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="chat" className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        AI Chat
                    </TabsTrigger>
                    <TabsTrigger value="form" className="flex items-center gap-2">
                        <FormInput className="w-4 h-4" />
                        Manual Form
                    </TabsTrigger>
                </TabsList>

                <TabsContent className="h-full w-full" value="chat">
                    <GoogleMapsScraperChat />
                </TabsContent>

                <TabsContent value="form" className="h-full w-full">
                    <GenerateLeads />
                </TabsContent>
            </Tabs>
        </PageLayout>
    );
}

export default function GoogleMapsScraperPage() {
    return (
        <LeadGenerationProvider>
            <GoogleMapsScraperContent />
        </LeadGenerationProvider>
    );
}
