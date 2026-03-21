import { auth } from '@/auth';
import { validateAndGetTenant } from '@/helpers/validate-tenant';
import { isPathAccessible } from '@/helpers/sidebar-config-helpers';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DEFAULT_HOME_PAGE_ROUTE, PATHNAME_HEADER_KEY} from '@/config/app-config';

/**
 * HOC that guards protected routes: auth, tenant validation, and module access.
 * Reuses sidebar config logic for route validation (single source of truth).
 *
 * @example
 * ```tsx
 * export default withRouteGuard(function ProtectedLayout({ children }) {
 *   return <SidebarProvider><AppSidebar />{children}</SidebarProvider>;
 * });
 * ```
 */
export function withRouteGuard<P extends object>(Component: React.ComponentType<P>) {
    return async function RouteGuardLayout(props: P) {
        const session = await auth();

        if (!session?.user) {
            redirect('/sign-in');
        }

        const currentTenantData = await validateAndGetTenant();
        if (!currentTenantData) {
            return notFound();
        }

        const pathname = (await headers()).get(PATHNAME_HEADER_KEY) ?? DEFAULT_HOME_PAGE_ROUTE;
        const isAdmin = session.user.isAdmin ?? false;
        const moduleAccess = session.user.moduleAccess;

        if (!isPathAccessible(pathname, isAdmin, moduleAccess)) {
            return notFound();
        }

        return <Component {...props} />;
    };
}
