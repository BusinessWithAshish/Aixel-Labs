import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { validateAndGetTenant } from '@/helpers/validate-tenant';
import NotFound from '@/app/not-found';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
    // First, check authentication
    const session = await auth();

    if (!session?.user) {
        redirect('/sign-in');
    }

    // Then, validate tenant for all protected routes
    const currentTenantData = await validateAndGetTenant();

    if (!currentTenantData) {
        return <NotFound />;
    }

    return (
        <SidebarProvider className="h-full w-full">
            <AppSidebar />
            {children}
        </SidebarProvider>
    );
}
