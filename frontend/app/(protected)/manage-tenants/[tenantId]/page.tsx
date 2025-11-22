import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { TenantUsersContent } from './_components';
import { useTenantUsersPage } from './_hooks';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllTenants } from '@/helpers/tenant-operations';

const PAGE_TITLE = 'Tenant Users';

type TenantUsersPageProps = {
    params: Promise<{ tenantId: string }>;
};

async function TenantUsersPage({ params }: TenantUsersPageProps) {
    const { tenantId } = await params;

    const tenants = await getAllTenants();
    const tenant = tenants.find((t) => t._id === tenantId);
    const pageTitle = tenant ? `Users - ${tenant.name}` : PAGE_TITLE;

    return (
        <PageProvider usePageHook={() => useTenantUsersPage(tenantId)}>
            <PageLayout title={pageTitle}>
                <TenantUsersContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(TenantUsersPage, { pageTitle: PAGE_TITLE });
