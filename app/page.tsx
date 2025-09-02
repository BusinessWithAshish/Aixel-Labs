import Link from "next/link";
import PageLayout from "@/components/common/PageLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowRightIcon } from "lucide-react";

export default function Home() {
  return (

    <PageLayout className='' title='Home'>

      <Card>
        <CardHeader>Aixel labs</CardHeader>
        <CardContent>
          <Link className='flex items-center gap-2' href={'/LGS'}>
            Dashboard
            <ArrowRightIcon />
          </Link>
        </CardContent>

      </Card>
    </PageLayout>

  );
}
