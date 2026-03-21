import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { withRouteGuard } from '@/components/hocs/with-route-guard';

function ProtectedLayoutContent({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider className="h-full w-full">
            <AppSidebar />
            {children}
        </SidebarProvider>
    );
}

export default withRouteGuard(ProtectedLayoutContent);
