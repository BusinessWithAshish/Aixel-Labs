import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { NavigationLoaderProvider } from '@/contexts/NavigationLoader';

/**
 * Shared shell for authenticated app areas: sidebar state, main nav, and navigation loading overlay.
 */
export function SidebarAppShell({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider className="h-full w-full">
            <AppSidebar />
            <NavigationLoaderProvider>{children}</NavigationLoaderProvider>
        </SidebarProvider>
    );
}
