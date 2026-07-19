import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
import { TenantUsersContent } from './_components/TenantUsersContent';
import { useTenantUsersPage } from './_hooks/use-tenant-users-page';
import { withAdminOnly } from '@/components/hocs/with-admin';
import { getAllUsersByTenant } from '@/app/actions/user-actions';
import { listCoupons } from '@/app/actions/coupon-actions';
import { getTenantByName } from '@/app/actions/tenant-actions';
import { PageProvider } from '@/contexts/PageStore';
import { getAppSession } from '@/server/auth';
import type { Coupon, ModuleAccess, User } from '@aixellabs/backend/db/types';

async function TenantUsersPage({ params }: { params: Promise<{ tenantId: string }> }) {
    const { tenantId } = await params;
    const session = await getAppSession();
    const sessionTenantName = session?.user.tenantName ?? '';
    const isForeignTenant = sessionTenantName !== tenantId;

    let users: User[] = [];
    let coupons: Coupon[] = [];
    let defaultModuleAccess: ModuleAccess = {};

    if (!isForeignTenant) {
        const [usersResponse, couponsResponse, tenantRes] = await Promise.all([
            getAllUsersByTenant(tenantId),
            listCoupons(),
            getTenantByName(tenantId),
        ]);
        users = usersResponse.success && usersResponse.data ? usersResponse.data : [];
        coupons = couponsResponse.success && couponsResponse.data ? couponsResponse.data : [];
        defaultModuleAccess = tenantRes.data?.defaultModuleAccess ?? {};
    }

    const pageTitle = `Users - ${tenantId.toLocaleUpperCase()}`;

    return (
        <PageProvider
            data={{
                users,
                coupons,
                sessionTenantName,
                tenantSlug: tenantId,
                defaultModuleAccess,
                currentUserId: session?.user.id ?? '',
            }}
            usePageHook={useTenantUsersPage}
        >
            <PageLayout title={pageTitle}>
                <TenantUsersContent />
            </PageLayout>
        </PageProvider>
    );
}

export default withAdminOnly(withPageHandler(TenantUsersPage));
