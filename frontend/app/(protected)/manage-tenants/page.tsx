import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { ManageTenantsContent } from './_components/ManageTenantsContent';
import { useManageTenantsPage } from './_hooks/use-manage-tenants-page';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllTenants } from '@/app/actions/tenant-actions';
import { PageProvider } from '@/contexts/PageStore';
import { getAppSession } from '@/server/auth';

const PAGE_TITLE = 'Manage Tenants';

async function ManageTenantsPage() {
    const session = await getAppSession();
    const res = await getAllTenants();
    const tenants = res.success ? (res.data ?? []) : [];

    return (
        <PageProvider
            data={{ tenants, sessionTenantName: session?.user.tenantName ?? '' }}
            usePageHook={useManageTenantsPage}
        >
            <PageLayout title={PAGE_TITLE}>
                <ManageTenantsContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(withPageHandler(ManageTenantsPage));
