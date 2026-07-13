'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { APP_NAME, DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { AppLogo } from '../common/AppLogo';
import { Tenant, TenantType } from '@aixellabs/backend/db/types';
import { getTenantMaskedUrl } from '@/helpers/get-tenant-masked-url';

const TENANT_TYPE_GROUPS = [
    { key: 'default', label: 'Default', match: (t: Tenant) => !t.type },
    { key: TenantType.PRODUCT, label: 'Product', match: (t: Tenant) => t.type === TenantType.PRODUCT },
    { key: TenantType.IFRAME, label: 'Iframe', match: (t: Tenant) => t.type === TenantType.IFRAME },
    { key: TenantType.EXTERNAL, label: 'External', match: (t: Tenant) => t.type === TenantType.EXTERNAL },
] as const;

function tenantDisplayName(tenant: Tenant) {
    return tenant.label || tenant.name || 'Unnamed Tenant';
}

function groupTenantsByType(tenants: Tenant[]) {
    return TENANT_TYPE_GROUPS.map((group) => ({
        ...group,
        tenants: tenants.filter(group.match),
    })).filter((group) => group.tenants.length > 0);
}

export function TenantSwitcher({
    tenants,
    isAdmin,
    currentTenant,
}: {
    tenants: Tenant[];
    isAdmin: boolean;
    currentTenant: Tenant | null;
}) {
    const { isMobile } = useSidebar();
    const router = useRouter();

    if (!currentTenant) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" className="cursor-default">
                        <AppLogo />
                        <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-medium">{APP_NAME.toLocaleUpperCase()}</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    const activeTenantName = tenantDisplayName(currentTenant);

    if (!isAdmin) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" className="cursor-default">
                        <AppLogo />
                        <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-medium">{activeTenantName}</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    const groupedTenants = groupTenantsByType(tenants);

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <AppLogo />
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{activeTenantName}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        align="start"
                        side={isMobile ? 'bottom' : 'right'}
                        sideOffset={4}
                    >
                        {groupedTenants.map((group, index) => (
                            <DropdownMenuGroup key={group.key}>
                                {index > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-muted-foreground text-xs">
                                    {group.label}
                                </DropdownMenuLabel>
                                {group.tenants.map((tenant) => {
                                    const name = tenantDisplayName(tenant);
                                    return (
                                        <DropdownMenuItem
                                            key={tenant._id}
                                            className="gap-2 p-2"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                window.location.href =
                                                    getTenantMaskedUrl(tenant) || DEFAULT_HOME_PAGE_ROUTE;
                                            }}
                                        >
                                            <AppLogo src={tenant.app_logo_url} alt={name} />
                                            {name}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuGroup>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="gap-2 p-2"
                            onClick={() => router.push('/manage-tenants')}
                        >
                            <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                                <Plus className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">Manage Tenants</div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
