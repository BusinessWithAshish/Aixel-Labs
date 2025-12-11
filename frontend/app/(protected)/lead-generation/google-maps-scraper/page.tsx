import PageLayout from '@/components/common/PageLayout';
import { GenerateLeads, LeadGenerationProvider } from '@/app/(protected)/lead-generation/google-maps-scraper/_components';
import { ChatInterface } from '@/components/common/ChatInterface';

export default function GoogleMapsScraperPage() {
    return (
        <PageLayout title="Google Maps Scraper">
            <LeadGenerationProvider>
                <ChatInterface
                    assistantName="Google Maps AI"
                    assistantDescription="Extract business data efficiently"
                    placeholder="Search for businesses, locations, or data..."
                    className="shadow-lg"
                />
                <GenerateLeads />
            </LeadGenerationProvider>
        </PageLayout>
    );
}
