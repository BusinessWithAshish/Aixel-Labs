import PageLayout from '@/components/common/PageLayout';
// import { Card, CardHeader, CardTitle } from '@/components/ui/card';
// import { getCurrentTenantFromHeaders } from '@/helpers/validate-tenant';

export default async function Home() {
    // const currentTenant = await getCurrentTenantFromHeaders();
    return (
        <PageLayout className="flex flex-col items-center justify-center h-full" title="Home">
            <div className="text-2xl font-bold">Aixel Labs Home page</div>
        </PageLayout>
    );
}
