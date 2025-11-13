"use client"

import { Card } from "@/components/ui/card"
import type { SidebarTenant } from "@/config/sidebar.config"
import { cn } from "@/lib/utils"

type TenantCardProps = {
    tenant: SidebarTenant
    onClick?: () => void
    className?: string
}

export function TenantCard({ tenant, onClick, className }: TenantCardProps) {
    const Icon = tenant.logo

    return (
        <Card
            className={cn(
                "flex flex-col items-center justify-center p-6 cursor-pointer transition-all hover:shadow-lg hover:scale-105",
                className
            )}
            onClick={onClick}
        >
            <div className="flex items-center justify-center w-16 h-16 rounded-lg bg-primary/10 mb-4">
                <Icon className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-center">{tenant.name}</h3>
            <p className="text-sm text-muted-foreground text-center mt-1">{tenant.url}</p>
        </Card>
    )
}
