'use client';

import { useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { APP_NAME, DEFAULT_HOME_PAGE_ROUTE } from "@/config/app-config";
import { AppLogo } from '../common/AppLogo';
import { Tenant } from '@aixellabs/shared/mongodb';

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

    const handleTenantClick = (e: React.MouseEvent, tenant: Tenant) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = tenant.redirect_url ?? DEFAULT_HOME_PAGE_ROUTE;
    };

    const handleManageTenantsClick = () => {
        router.push('/manage-tenants');
    };

    const getTenantDisplayName = (tenant: Tenant) => {
        return tenant.label ?? tenant.name.toLocaleUpperCase();
    };

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

    const activeTenantName = getTenantDisplayName(currentTenant);

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
                        <DropdownMenuLabel className="text-muted-foreground text-xs">Tenants</DropdownMenuLabel>
                        {tenants.map((tenant) => {
                            const tenantDisplayName = getTenantDisplayName(tenant);

                            return (
                                <DropdownMenuItem
                                    key={tenant._id}
                                    onClick={(e) => handleTenantClick(e, tenant)}
                                    className="gap-2 p-2"
                                >
                                    <AppLogo src={tenant.app_logo_url} alt={tenantDisplayName} />
                                    {tenantDisplayName}
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
