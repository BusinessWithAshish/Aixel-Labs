'use client';

import { ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItems,
    DropdownMenuTrigger,
    type DropdownMenuOption,
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

    const options: DropdownMenuOption[] = [
        ...groupedTenants.flatMap((group, index) => {
            const groupOptions: DropdownMenuOption[] = [];
            if (index > 0) {
                groupOptions.push({ type: 'separator', key: `sep-${group.key}` });
            }
            groupOptions.push({
                type: 'label',
                key: `label-${group.key}`,
                label: group.label,
                className: 'text-muted-foreground text-xs',
            });
            for (const tenant of group.tenants) {
                const name = tenantDisplayName(tenant);
                groupOptions.push({
                    key: tenant._id,
                    label: name,
                    icon: <AppLogo src={tenant.app_logo_url} alt={name} />,
                    className: 'gap-2 p-2',
                    onSelect: () => {
                        window.location.href =
                            getTenantMaskedUrl(tenant) || DEFAULT_HOME_PAGE_ROUTE;
                    },
                });
            }
            return groupOptions;
        }),
        { type: 'separator', key: 'sep-manage' },
        {
            key: 'manage-tenants',
            className: 'gap-2 p-2',
            label: (
                <>
                    <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                        <Plus className="size-4" />
                    </div>
                    <div className="text-muted-foreground font-medium">Manage Tenants</div>
                </>
            ),
            onSelect: () => router.push('/manage-tenants'),
        },
    ];

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
                        <DropdownMenuItems options={options} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
