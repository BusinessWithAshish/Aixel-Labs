'use client';

import * as React from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import type { SidebarTenant } from '@/config/sidebar.config';
import { getIcon } from '@/lib/icon-map';

export function TenantSwitcher({
    tenants,
    isAdmin,
    currentTenantName,
}: {
    tenants: SidebarTenant[];
    isAdmin: boolean;
    currentTenantName: string;
}) {
    const { isMobile } = useSidebar();
    const router = useRouter();
    const [activeTenant, setActiveTenant] = React.useState<SidebarTenant>(
        tenants[0] || { name: currentTenantName, logo: 'GalleryVerticalEnd', url: '' },
    );

    const handleTenantClick = (tenant: SidebarTenant) => {
        setActiveTenant(tenant);
        window.open(tenant.url, '_blank');
    };

    const handleManageTenantsClick = () => {
        router.push('/manage-tenants');
    };

    const ActiveLogo = getIcon(activeTenant.logo);

    if (!isAdmin) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" className="cursor-default">
                        <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                            {ActiveLogo && <ActiveLogo className="size-4" />}
                        </div>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                            <span className="truncate font-medium">{activeTenant.name.toUpperCase()}</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                {ActiveLogo && <ActiveLogo className="size-4" />}
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium">{activeTenant.name}</span>
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
                        <DropdownMenuLabel className="text-muted-foreground text-xs">Tenants</DropdownMenuLabel>
                        {tenants.map((tenant, index) => {
                            const TenantLogo = getIcon(tenant.logo);
                            return (
                                <DropdownMenuItem
                                    key={tenant.name}
                                    onClick={() => handleTenantClick(tenant)}
                                    className="gap-2 p-2"
                                >
                                    <div className="flex size-6 items-center justify-center rounded-md border">
                                        {TenantLogo && <TenantLogo className="size-3.5 shrink-0" />}
                                    </div>
                                    {tenant.name}
                                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                                </DropdownMenuItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2" onClick={handleManageTenantsClick}>
                            <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                                <Plus className="size-4" />
                            </div>
                            <div className="text-muted-foreground font-medium">Manage tenants</div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
