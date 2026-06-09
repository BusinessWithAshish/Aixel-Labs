import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormInput, MessageSquare } from 'lucide-react';
import { useLinkedInForm } from './_hooks/use-linkedin-form';
import { LinkedInFormWrapper } from './_components/LinkedInFormWrapper';
import { LinkedInScraperChat } from './_components/LinkedInScraperChat';

enum LinkedInPageTabs {
    CHAT = 'AI Chat',
    FORM = 'Manual Form',
}

export default function LinkedInLeadGenerationPage() {
    return (
        <PageProvider usePageHook={useLinkedInForm}>
            <PageLayout className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" title="LinkedIn">
                <Tabs defaultValue={LinkedInPageTabs.FORM} className="flex min-h-0 flex-1 flex-col gap-2">
                    <TabsList className="w-full">
                        <TabsTrigger value={LinkedInPageTabs.CHAT} className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            {LinkedInPageTabs.CHAT}
                        </TabsTrigger>
                        <TabsTrigger value={LinkedInPageTabs.FORM} className="flex items-center gap-2">
                            <FormInput className="h-4 w-4" />
                            {LinkedInPageTabs.FORM}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent
                        className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
                        value={LinkedInPageTabs.CHAT}
                    >
                        <LinkedInScraperChat />
                    </TabsContent>
                    <TabsContent
                        className="flex min-h-0 flex-1 flex-col overflow-auto outline-none"
                        value={LinkedInPageTabs.FORM}
                    >
                        <LinkedInFormWrapper />
                    </TabsContent>
                </Tabs>
            </PageLayout>
        </PageProvider>
    );
}
