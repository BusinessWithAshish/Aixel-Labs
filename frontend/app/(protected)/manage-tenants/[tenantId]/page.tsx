import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { TenantUsersContent } from './_components';
import { useTenantUsersPage } from './_hooks';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getUsersByTenantId } from '@/helpers/user-operations';

const PAGE_TITLE = 'Tenant Users';

async function TenantUsersPage({ params }: { params: Promise<{ tenantId: string }> }) {
    const { tenantId } = await params;

    const users = await getUsersByTenantId(tenantId);
    const pageTitle = `Users - ${tenantId.toLocaleUpperCase()}`;

    return (
        <PageProvider data={users} usePageHook={useTenantUsersPage}>
            <PageLayout title={pageTitle}>
                <TenantUsersContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(TenantUsersPage, { pageTitle: PAGE_TITLE });
