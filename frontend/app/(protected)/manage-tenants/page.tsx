import PageLayout from '@/components/common/PageLayout';
import { PageProvider } from '@/contexts/PageStore';
import { ManageTenantsContent } from './_components';
import { useManageTenantsPage } from './_hooks';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllTenants } from '@/helpers/tenant-operations';

const PAGE_TITLE = 'Manage Tenants';

async function ManageTenantsPage() {
    const tenants = await getAllTenants();

    return (
        <PageProvider data={tenants} usePageHook={useManageTenantsPage}>
            <PageLayout title={PAGE_TITLE}>
                <ManageTenantsContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(ManageTenantsPage, { pageTitle: PAGE_TITLE });
