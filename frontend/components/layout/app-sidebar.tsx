"use client"

import * as React from "react"

import {NavMain} from "@/components/layout/nav-main"
import {NavUser} from "@/components/layout/nav-user"
import {TenantSwitcher} from "@/components/layout/tenant-switcher"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"
import {sidebarConfig} from "@/config/sidebar.config"

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TenantSwitcher tenants={sidebarConfig.tenants}/>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={sidebarConfig.navMain}/>
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={sidebarConfig.user}/>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    )
}
