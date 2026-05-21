import PageLayout from '@/components/common/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FormInput } from 'lucide-react';
import { PageProvider } from '@/contexts/PageStore';
import { useGoogleMapsForm } from './_hooks/use-google-maps-form';
import { GoogleMapsFormWrapper } from './_components/GoogleMapsFormWrapper';
import { GoogleMapsScraperChat } from './_components/GoogleMapsScraperChat';

enum GoogleMapsPageTabs {
    CHAT = 'AI Chat',
    FORM = 'Manual Form',
}

export default function GoogleMapsPage() {
    return (
        <PageProvider usePageHook={useGoogleMapsForm}>
            <PageLayout className="space-y-4" title="Google Maps Scraper">
                <Tabs defaultValue={GoogleMapsPageTabs.CHAT} className="h-full w-full">
                    <TabsList className="w-full">
                        <TabsTrigger value={GoogleMapsPageTabs.CHAT} className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            {GoogleMapsPageTabs.CHAT}
                        </TabsTrigger>
                        <TabsTrigger value={GoogleMapsPageTabs.FORM} className="flex items-center gap-2">
                            <FormInput className="w-4 h-4" />
                            {GoogleMapsPageTabs.FORM}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent className="h-full w-full" value={GoogleMapsPageTabs.CHAT}>
                        <GoogleMapsScraperChat />
                    </TabsContent>

                    <TabsContent className="h-full w-full" value={GoogleMapsPageTabs.FORM}>
                        <GoogleMapsFormWrapper />
                    </TabsContent>
                </Tabs>
            </PageLayout>
        </PageProvider>
    );
}
