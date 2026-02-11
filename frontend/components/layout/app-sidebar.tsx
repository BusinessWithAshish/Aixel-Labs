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
import { generateSidebarConfig } from '@/helpers/sidebar-config-helpers';
import { Tenant } from '@aixellabs/shared/mongodb';
import { validateAndGetTenant } from '@/helpers/validate-tenant';

export async function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const session = await auth();

    const isAdmin = session?.user?.isAdmin ?? false;
    const moduleAccess = session?.user?.moduleAccess;

    // Generate sidebar config based on user's access
    const sidebarConfig = generateSidebarConfig(isAdmin, moduleAccess);

    const tenants = isAdmin ? await getAllTenants() : [];

    const currentTenant = await validateAndGetTenant();

    const tenantsForSwitcher: Tenant[] = tenants.map((tenant) => ({
        ...tenant,
        redirect_url: getTenantRedirectUrl(tenant),
    }));

    const user = {
        name: session?.user?.name || 'User',
        email: session?.user?.email || 'user@example.com',
        avatar: 'https://github.com/shadcn.png',
        isAdmin: isAdmin,
        tenantName: session?.user?.tenantName || '',
        tenantId: session?.user?.tenantId || '',
    };

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TenantSwitcher tenants={tenantsForSwitcher} isAdmin={user.isAdmin} currentTenant={currentTenant} />
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
