import {
    AudioWaveform,
    Bot,
    Command,
    GalleryVerticalEnd,
    Map,
    Mail,
    Settings2, UsersRound, MessageCircleMore,
} from "lucide-react"

export const LEFT_SIDEBAR_MENU = {
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
            url: "/lead-generation",
            icon: UsersRound,
            items: [
                {title: "All in 1 scraper", url: "/lead-generation/AI1"},
                {title: "Google Maps Scraper", url: "/lead-generation/LGS"},
                {title: "Google Advanced Search", url: "/lead-generation"},
                {title: "LinkedIn", url: "/lead-generation"},
                {title: "Instagram", url: "/lead-generation"},
                {title: "Facebook", url: "/lead-generation"},
            ],
        },
        {
            title: "Voice Agent",
            url: "/voice-agent",
            icon: AudioWaveform,
            items: [
                {title: "Web dialer", url: "/voice-agent/web-dialer"},
                {title: "Inquiry / Bookings", url: "/voice-agent"},
                {title: "Custom Agent Analytics", url: "/voice-agent"},
            ],
        },
        {
            title: "Messaging",
            url: "/messaging",
            icon: MessageCircleMore,
            items: [
                {title: "Whatsapp", url: "/messaging/whatsapp"},
                {title: "SMS", url: "/messaging/sms"},
                {title: "Analytics", url: "/messaging"},
            ],
        },
        {
            title: "Email Module",
            url: "/mail",
            icon: Mail,
            items: [
                {title: "Cold Outreach", url: "/mail"},
                {title: "Warm Outreach", url: "/mail"},
                {title: "Templates", url: "/mail"},
                {title: "AI Replies", url: "/mail"},
                {title: "Analytics", url: "/mail"},
            ],
        },
        {
            title: "Client Management",
            url: "/settings",
            icon: Settings2,
            items: [
                {title: "Enabled Modules", url: "/settings/enabled-modules",},
                {title: "Multi-tenant Accounts", url: "/settings/multi-tenant-accounts",},
            ],
        },
    ],
}


export const useSidebar = () => {

    return LEFT_SIDEBAR_MENU;

}