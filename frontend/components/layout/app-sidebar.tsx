"use client"

import * as React from "react"

import {NavMain} from "@/components/layout/nav-main"
import {NavUser} from "@/components/layout/nav-user"
import {TeamSwitcher} from "@/components/layout/team-switcher"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"
import {useSidebar} from "@/hooks/use-sidebar";

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {

    const data = useSidebar();

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TeamSwitcher teams={data.teams}/>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={data.navMain}/>
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={data.user}/>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    )
}
