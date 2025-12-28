import * as React from 'react';
import { auth } from '@/auth';
import { NavMain } from '@/components/layout/nav-main';
import { NavUser } from '@/components/layout/nav-user';
import { TenantSwitcher } from '@/components/layout/tenant-switcher';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
    SidebarMenu,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { getAllTenants } from '@/helpers/tenant-operations';
import { getTenantRedirectUrl } from '@/helpers/get-tenant-redirect-url';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { useSidebar } from '@/hooks/use-sidebar';

export async function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const sidebarConfig = useSidebar();
    const session = await auth();

    const tenants = session?.user?.isAdmin ? await getAllTenants() : [];

    const tenantsForSwitcher = tenants.map((tenant) => ({
        name: tenant.name,
        logo: 'GalleryVerticalEnd' as const,
        url: getTenantRedirectUrl(tenant),
    }));

    const user = {
        name: session?.user?.name || 'User',
        email: session?.user?.email || 'user@example.com',
        avatar: 'https://github.com/shadcn.png',
        isAdmin: session?.user?.isAdmin ?? false,
        tenantId: session?.user?.tenantId || '',
    };

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TenantSwitcher tenants={tenantsForSwitcher} isAdmin={user.isAdmin} currentTenantName={user.tenantId} />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={sidebarConfig.navMain} />
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem className="flex w-full items-center py-2">
                        <ThemeToggle />
                    </SidebarMenuItem>
                </SidebarMenu>
                <NavUser user={user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
