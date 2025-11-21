import PageLayout from "@/components/common/PageLayout";
import { GenerateLeads, LeadGenerationProvider } from "@/app/(protected)/lead-generation/LGS/_components";

export default function LGSPage() {

    return (
        <PageLayout title='Lead Generation'>
            <LeadGenerationProvider>
                <GenerateLeads />
            </LeadGenerationProvider>
        </PageLayout>
    )

}