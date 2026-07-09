import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { TenantUsersContent } from './_components/TenantUsersContent';
import { useTenantUsersPage } from './_hooks/use-tenant-users-page';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllUsersByTenant } from '@/app/actions/user-actions';
import { PageProvider } from '@/contexts/PageStore';

async function TenantUsersPage({ params }: { params: Promise<{ tenantId: string }> }) {
    const { tenantId } = await params;

    const usersResponse = await getAllUsersByTenant(tenantId);
    const users = usersResponse.success && usersResponse.data ? usersResponse.data : [];
    const pageTitle = `Users - ${tenantId.toLocaleUpperCase()}`;

    return (
        <PageProvider data={users} usePageHook={useTenantUsersPage}>
            <PageLayout title={pageTitle}>
                <TenantUsersContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(withPageHandler(TenantUsersPage));
