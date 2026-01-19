'use client';

import * as React from 'react';
import { ChevronsUpDown, GalleryVerticalEnd, Plus } from 'lucide-react';
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
import { DEFAULT_HOME_PAGE_ROUTE } from "@/config/app-config";
import { AppLogo } from '../common/AppLogo';

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
        tenants[0] || { name: currentTenantName, url: DEFAULT_HOME_PAGE_ROUTE },
    );

    const handleTenantClick = (e: React.MouseEvent, tenant: SidebarTenant) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveTenant(tenant);
        window.location.href = tenant.url;
    };

    const handleManageTenantsClick = () => {
        router.push('/manage-tenants');
    };

    const activeTenantName = activeTenant.name.toLocaleUpperCase();

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

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
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
                        <DropdownMenuLabel className="text-muted-foreground text-xs">Tenants</DropdownMenuLabel>
                        {tenants.map((tenant) => {
                            const tenantName = tenant.name.toLocaleUpperCase();

                            return (
                                <DropdownMenuItem
                                    key={tenant.name}
                                    onClick={(e) => handleTenantClick(e, tenant)}
                                    className="gap-2 p-2"
                                >
                                    <AppLogo />
                                    {tenant.name.toLocaleUpperCase()}
                                    <DropdownMenuShortcut>⌘{tenantName.charCodeAt(0)}</DropdownMenuShortcut>
                                </DropdownMenuItem>
                            );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2" onClick={handleManageTenantsClick}>
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
