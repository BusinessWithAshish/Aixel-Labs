import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const ProtectedLayout = async ({ children }: { children: React.ReactNode }) => {

    const session = await auth();

    if (!session?.user) {
        redirect('/sign-in');
    }

    return (
        <SidebarProvider className="h-full w-full">
            <AppSidebar />
            {children}
        </SidebarProvider>
    );
};