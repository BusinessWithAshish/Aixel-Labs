import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { NavigationLoaderProvider } from '@/contexts/NavigationLoader';
import { NavigationProgress } from '@/components/layout/NavigationProgress';

/**
 * Shared shell for authenticated app areas: sidebar state, main nav, navigation loading overlay and progress bar.
 */
export function SidebarAppShell({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider className="h-full w-full">
            <NavigationProgress />
            <AppSidebar />
            <NavigationLoaderProvider>{children}</NavigationLoaderProvider>
        </SidebarProvider>
    );
}
