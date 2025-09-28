import PageLayout from "@/components/common/PageLayout";
import {GenerateLeads, LeadGenerationProvider} from "@/app/lead-generation/LGS/_components";

export default function LGSPage() {

    return (
        <PageLayout title='LGS'>
             <LeadGenerationProvider>
                <GenerateLeads />
            </LeadGenerationProvider>
        </PageLayout>
    )

}