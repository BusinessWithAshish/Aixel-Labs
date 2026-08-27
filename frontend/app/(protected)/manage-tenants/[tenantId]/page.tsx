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

    const [usersResponse, couponsResponse, tenantRes] = await Promise.all([
        getAllUsersByTenant(tenantId),
        listCoupons(tenantId),
        getTenantByName(tenantId),
    ]);

    const users: User[] = usersResponse.success && usersResponse.data ? usersResponse.data : [];
    const coupons: Coupon[] = couponsResponse.success && couponsResponse.data ? couponsResponse.data : [];
    const defaultModuleAccess: ModuleAccess = tenantRes.data?.defaultModuleAccess ?? {};

    const pageTitle = `Users - ${tenantId.toLocaleUpperCase()}`;

    return (
        <PageProvider
            data={{
                users,
                coupons,
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
