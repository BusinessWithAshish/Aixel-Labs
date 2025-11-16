import PageLayout from '@/components/common/PageLayout';
import {Card, CardHeader} from '@/components/ui/card';
import {getCurrentTenant} from '@/helpers/validate-tenant';

export default async function Home() {
    const currentTenant = await getCurrentTenant();
    return (
        <PageLayout className="" title="Home">
            <Card>
                <CardHeader>{currentTenant}</CardHeader>
            </Card>
        </PageLayout>
    );
}
