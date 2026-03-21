import PageLayout from '@/components/common/PageLayout';
import { useInstagramForm } from './_hooks/use-instagram-form';
import { PageProvider } from '@/contexts/PageStore';
import { InstagramSearchFormWrapper } from './_components/InstagramSearchFormWrapper';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { FormInput, List, MessageSquare } from 'lucide-react';
import { TabsTrigger } from '@/components/ui/tabs';
import { InstagramResultsSection } from './_components/InstagramResultsSection';
import { InstagramScraperChat } from './_components/InstagramScraperChat';

enum InstagramSearchPageTabs {
    CHAT = 'AI Chat',
    FORM = 'Manual Form',
    RESULTS = 'Results',
}

export default function InstagramSearchPage() {
    return (
        <PageProvider usePageHook={useInstagramForm}>
            <PageLayout className="space-y-4" title="Instagram Search">
                <Tabs defaultValue={InstagramSearchPageTabs.CHAT} className="h-full w-full">
                    <TabsList defaultValue={InstagramSearchPageTabs.RESULTS} className="w-full">
                        <TabsTrigger value={InstagramSearchPageTabs.CHAT} className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            {InstagramSearchPageTabs.CHAT}
                        </TabsTrigger>
                        <TabsTrigger value={InstagramSearchPageTabs.FORM} className="flex items-center gap-2">
                            <FormInput className="w-4 h-4" />
                            {InstagramSearchPageTabs.FORM}
                        </TabsTrigger>
                        <TabsTrigger value={InstagramSearchPageTabs.RESULTS} className="flex items-center gap-2">
                            <List className="w-4 h-4" />
                            {InstagramSearchPageTabs.RESULTS}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent className="h-full w-full" value={InstagramSearchPageTabs.CHAT}>
                        <InstagramScraperChat />
                    </TabsContent>
                    <TabsContent className="h-full w-full" value={InstagramSearchPageTabs.FORM}>
                        <InstagramSearchFormWrapper />
                    </TabsContent>
                    <TabsContent className="h-full w-full" value={InstagramSearchPageTabs.RESULTS}>
                        <InstagramResultsSection />
                    </TabsContent>
                </Tabs>
            </PageLayout>
        </PageProvider>
    );
}


