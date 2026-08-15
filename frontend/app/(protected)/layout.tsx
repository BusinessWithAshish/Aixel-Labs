import { SidebarAppShell } from '@/components/layout/sidebar-app-shell';
import { withRouteGuard } from '@/components/hocs/with-route-guard';

/** All routes here read the session cookie, so none of them can be statically generated. */
export const dynamic = 'force-dynamic';

/** `(protected)` segment: full route guard, then shared app chrome. */
function ProtectedSegmentLayout({ children }: { children: React.ReactNode }) {
    return <SidebarAppShell>{children}</SidebarAppShell>;
}

export default withRouteGuard(ProtectedSegmentLayout);
