'use client';

import PageLayout from "@/components/common/PageLayout";
import {GenerateLeads} from "@/app/lead-generation/LGS/_components/GenerateLeads";

export default function LGSPage() {

    return (
        <PageLayout title='LGS'>
            <GenerateLeads/>
        </PageLayout>
    )

}