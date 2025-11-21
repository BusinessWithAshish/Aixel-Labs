import PageLayout from '@/components/common/PageLayout';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentTenantFromHeaders } from '@/helpers/validate-tenant';

export default async function Home() {
    const currentTenant = await getCurrentTenantFromHeaders();
    return (
        <PageLayout className="" title="Home">
            I am inside the protected layout
            <Card>
                <CardTitle>{currentTenant}</CardTitle>
                <CardHeader>{currentTenant}</CardHeader>
            </Card>
        </PageLayout>
    );
}
