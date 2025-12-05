import PageLayout from "@/components/common/PageLayout";
import { GenerateLeads, LeadGenerationProvider } from "@/app/(protected)/lead-generation/google-maps-scraper/_components";

export default function GoogleMapsScraperPage() {

    return (
        <PageLayout title='Google Maps Scraper'>
            <LeadGenerationProvider>
                <GenerateLeads />
            </LeadGenerationProvider>
        </PageLayout>
    )

}