import PageLayout from '@/components/common/PageLayout';
import { withPageData } from '@/contexts/PageStore';
import { ManageTenantsContent } from './_components';
import { useManageTenantsPage } from './_hooks';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllTenants } from '@/helpers/tenant-operations';

const PAGE_TITLE = 'Manage Tenants';

async function ManageTenantsPage() {
    const tenants = await getAllTenants();

    return (
        <PageLayout title={PAGE_TITLE}>
            {withPageData({
                dataFetchResult: tenants,
                usePageHook: useManageTenantsPage,
                loadingText: 'Loading tenants...',
                emptyMessage: 'No tenants found.',
                children: <ManageTenantsContent />,
            })}
        </PageLayout>
    );
}

export default withAdminOnly(ManageTenantsPage, { pageTitle: PAGE_TITLE });
