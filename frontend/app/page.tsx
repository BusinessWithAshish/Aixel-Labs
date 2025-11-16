import PageLayout from '@/components/common/PageLayout';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentTenant } from '@/helpers/validate-tenant';

export default async function Home() {
    const currentTenant = await getCurrentTenant();
    return (
        <PageLayout className="" title="Home">
            <Card>
                <CardTitle>{currentTenant}</CardTitle>
                <CardHeader>{currentTenant}</CardHeader>
            </Card>
        </PageLayout>
    );
}
