'use client';

import PageLayout from "@/components/common/PageLayout";
import { LeadsOverview } from "@/app/LGS/_components/LeadsOverview";
import { GenerateLeads } from "@/app/LGS/_components/GenerateLeads";

export default function LGSPage(){

  return (
    <PageLayout title='LGS'>
      {/*<LeadsOverview />*/}
      <GenerateLeads />
    </PageLayout>
  )

}