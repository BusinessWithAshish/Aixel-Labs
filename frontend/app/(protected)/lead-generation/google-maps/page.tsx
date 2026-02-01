import PageLayout from '@/components/common/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, FormInput, List } from 'lucide-react';
import { PageProvider } from '@/contexts/PageStore';
import { useGoogleMapsForm } from './_hooks/use-google-maps-form';
import { GoogleMapsFormWrapper, GoogleMapsScraperChat, ResultsSection } from './_components';

enum GoogleMapsTabs {
    CHAT = 'AI Chat',
    FORM = 'Manual Form',
    RESULTS = 'Results',
}

export default function GoogleMapsPage() {
    return (
        <PageProvider usePageHook={useGoogleMapsForm}>
            <PageLayout className="space-y-4" title="Google Maps Scraper">
                <Tabs defaultValue={GoogleMapsTabs.CHAT} className="h-full w-full">
                    <TabsList className="w-full">
                        <TabsTrigger value={GoogleMapsTabs.CHAT} className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            {GoogleMapsTabs.CHAT}
                        </TabsTrigger>
                        <TabsTrigger value={GoogleMapsTabs.FORM} className="flex items-center gap-2">
                            <FormInput className="w-4 h-4" />
                            {GoogleMapsTabs.FORM}
                        </TabsTrigger>
                        <TabsTrigger value={GoogleMapsTabs.RESULTS} className="flex items-center gap-2">
                            <List className="w-4 h-4" />
                            {GoogleMapsTabs.RESULTS}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent className="h-full w-full" value={GoogleMapsTabs.CHAT}>
                        <GoogleMapsScraperChat />
                    </TabsContent>

                    <TabsContent className="h-full w-full" value={GoogleMapsTabs.FORM}>
                        <GoogleMapsFormWrapper />
                    </TabsContent>

                    <TabsContent className="h-full w-full" value={GoogleMapsTabs.RESULTS}>
                        <ResultsSection />
                    </TabsContent>

                </Tabs>
            </PageLayout>
        </PageProvider>
    );
}
