"use client"

import { sidebarConfig } from "@/config/sidebar.config"
import { TenantCard } from "./TenantCard"
import { CreateTenantCard } from "./CreateTenantCard"
import { CreateTenantDialog } from "./CreateTenantDialog"
import { usePage } from "@/contexts/PageStore"
import type { UseManageTenantsPageReturn } from "../_hooks/useManageTenantsPage"

export function ManageTenantsContent() {
    const { isCreateDialogOpen, setIsCreateDialogOpen } = usePage<UseManageTenantsPageReturn>()

    const handleTenantClick = (url: string) => {
        window.open(url, '_blank')
    }

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
                {sidebarConfig.tenants.map((tenant) => (
                    <TenantCard
                        key={tenant.name}
                        tenant={tenant}
                        onClick={() => handleTenantClick(tenant.url)}
                    />
                ))}
                <CreateTenantCard onClick={() => setIsCreateDialogOpen(true)} />
            </div>

            <CreateTenantDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
            />
        </>
    )
}
