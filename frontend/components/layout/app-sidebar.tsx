import * as React from "react"
import { auth } from "@/auth"
import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"
import { TenantSwitcher } from "@/components/layout/tenant-switcher"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"
import { sidebarConfig } from "@/config/sidebar.config"
import { getAllTenants } from "@/helpers/tenant-operations"
import { GalleryVerticalEnd } from "lucide-react"

export async function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {
    const session = await auth()
    
    const isAdmin = session?.user?.isAdmin ?? false
    const tenants = isAdmin ? await getAllTenants() : []
    
    const tenantsForSwitcher = tenants.map(tenant => ({
        name: tenant.name,
        logo: GalleryVerticalEnd,
        url: tenant.redirect_url || "http://localhost:3003"
    }))

    const user = {
        name: session?.user?.name || "User",
        email: session?.user?.email || "",
        avatar: ""
    }

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TenantSwitcher 
                    tenants={tenantsForSwitcher} 
                    isAdmin={isAdmin}
                    currentTenantName={session?.user?.tenantId || ""}
                />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={sidebarConfig.navMain} isAdmin={isAdmin} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user}/>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    )
}
