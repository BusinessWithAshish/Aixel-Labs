import PageLayout from '@/components/common/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FormInput } from 'lucide-react';
import { PageProvider } from '@/contexts/PageStore';
import { useInstagramForm } from './_hooks/use-instagram-form';
import { InstagramSearchFormWrapper } from './_components/InstagramSearchFormWrapper';
import { InstagramScraperChat } from './_components/InstagramScraperChat';

enum InstagramSearchPageTabs {
    CHAT = 'AI Chat',
    FORM = 'Manual Form',
}

export default function InstagramSearchPage() {
    return (
        <PageProvider usePageHook={useInstagramForm}>
            <PageLayout className="space-y-4" title="Instagram Search">
                <Tabs defaultValue={InstagramSearchPageTabs.CHAT} className="h-full w-full">
                    <TabsList className="w-full">
                        <TabsTrigger value={InstagramSearchPageTabs.CHAT} className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            {InstagramSearchPageTabs.CHAT}
                        </TabsTrigger>
                        <TabsTrigger value={InstagramSearchPageTabs.FORM} className="flex items-center gap-2">
                            <FormInput className="w-4 h-4" />
                            {InstagramSearchPageTabs.FORM}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent className="h-full w-full" value={InstagramSearchPageTabs.CHAT}>
                        <InstagramScraperChat />
                    </TabsContent>

                    <TabsContent className="h-full w-full" value={InstagramSearchPageTabs.FORM}>
                        <InstagramSearchFormWrapper />
                    </TabsContent>
                </Tabs>
            </PageLayout>
        </PageProvider>
    );
}
