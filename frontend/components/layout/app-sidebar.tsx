import * as React from 'react';
import { auth } from '@/auth';
import { NavMain } from '@/components/layout/nav-main';
import { NavUser } from '@/components/layout/nav-user';
import { TenantSwitcher } from '@/components/layout/tenant-switcher';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '@/components/ui/sidebar';
import { sidebarConfig } from '@/config/sidebar.config';
import { getAllTenants } from '@/helpers/tenant-operations';
import { getTenantRedirectUrl } from '@/helpers/get-tenant-redirect-url';

export async function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const session = await auth();

    const isAdmin = session?.user?.isAdmin ?? false;
    const tenants = isAdmin ? await getAllTenants() : [];

    const tenantsForSwitcher = tenants.map((tenant) => ({
        name: tenant.name,
        logo: 'GalleryVerticalEnd' as const,
        url: getTenantRedirectUrl(tenant),
    }));

    const user = {
        name: session?.user?.name || 'User',
        email: session?.user?.email || 'user@example.com',
        avatar: 'https://github.com/shadcn.png',
    };

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TenantSwitcher
                    tenants={tenantsForSwitcher}
                    isAdmin={isAdmin}
                    currentTenantName={session?.user?.tenantId || ''}
                />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={sidebarConfig.navMain} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
