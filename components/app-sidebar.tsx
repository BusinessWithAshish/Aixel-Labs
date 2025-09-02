"use client"

import * as React from "react"
import {
    AudioWaveform,
    Bot,
    Command,
    GalleryVerticalEnd,
    Map,
    Mail,
    Settings2,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"

// This is sample data.
const data = {
    user: {
        name: "Aixel Labs",
        email: "hello@aixellabs.com",
        avatar: "",
    },
    teams: [
        {
            name: "Acme Inc",
            logo: GalleryVerticalEnd,
            plan: "Enterprise",
        },
        {
            name: "Acme Corp.",
            logo: AudioWaveform,
            plan: "Startup",
        },
        {
            name: "Evil Corp.",
            logo: Command,
            plan: "Free",
        },
    ],
    navMain: [
        {
            title: "Lead Generation",
            url: "#",
            icon: Map,
            items: [
                { title: "Google Maps Scraper", url: "/LGS" },
                { title: "Google Advanced Search", url: "#" },
                { title: "LinkedIn", url: "#" },
                { title: "Instagram", url: "#" },
                { title: "Facebook", url: "#" },
            ],
        },
        {
            title: "Voice Agent",
            url: "/web-dialer",
            icon: AudioWaveform,
            items: [
                { title: "Call Leads", url: "/web-dialer" },
                { title: "Inquiry / Bookings", url: "#" },
                { title: "Custom Agent Analytics", url: "#" },
            ],
        },
        {
            title: "Cold DM",
            url: "#",
            icon: Bot,
            items: [
                { title: "Chatbots", url: "#" },
                { title: "Auto Scheduler", url: "#" },
                { title: "Analytics", url: "#" },
            ],
        },
        {
            title: "Email Module",
            url: "#",
            icon: Mail,
            items: [
                { title: "Cold Outreach", url: "#" },
                { title: "Warm Outreach", url: "#" },
                { title: "Templates", url: "#" },
                { title: "AI Replies", url: "#" },
                { title: "Analytics", url: "#" },
            ],
        },
        {
            title: "Client Management",
            url: "#",
            icon: Settings2,
            items: [
                { title: "Enabled Modules", url: "#" },
                { title: "Multi-tenant Accounts", url: "#" },
            ],
        },
    ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TeamSwitcher teams={data.teams} />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={data.navMain} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={data.user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
