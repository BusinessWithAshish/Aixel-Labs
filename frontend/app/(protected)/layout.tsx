import { SidebarAppShell } from '@/components/layout/sidebar-app-shell';
import { withRouteGuard } from '@/components/hocs/with-route-guard';

/** `(protected)` segment: full route guard, then shared app chrome. */
function ProtectedSegmentLayout({ children }: { children: React.ReactNode }) {
    return <SidebarAppShell>{children}</SidebarAppShell>;
}

export default withRouteGuard(ProtectedSegmentLayout);
