import PageLayout from '@/components/common/PageLayout';
import { withPageData } from '@/contexts/PageStore';
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
        <PageLayout title={pageTitle}>
            {withPageData({
                dataFetchResult: users,
                usePageHook: useTenantUsersPage,
                loadingText: 'Loading users...',
                emptyMessage: 'No users found.',
                children: <TenantUsersContent />,
            })}
        </PageLayout>
    );
}

export default withAdminOnly(TenantUsersPage, { pageTitle: PAGE_TITLE });
