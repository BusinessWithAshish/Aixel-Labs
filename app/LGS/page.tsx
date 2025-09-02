'use client';

import PageLayout from "@/components/common/PageLayout";
import { GenerateLeads } from "@/app/LGS/_components/GenerateLeads";
import Link from "next/link";

export default function LGSPage(){

  return (
    <PageLayout title='LGS'>
      <GenerateLeads />
    </PageLayout>
  )

}