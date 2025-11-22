import {
    AudioWaveform,
    GalleryVerticalEnd,
    Mail,
    MessageCircleMore,
    Settings2,
    UsersRound,
    type LucideIcon,
} from "lucide-react"
import type { IconName } from "@/config/sidebar.config"

export const iconMap: Record<IconName, LucideIcon> = {
    UsersRound,
    AudioWaveform,
    MessageCircleMore,
    Mail,
    Settings2,
    GalleryVerticalEnd,
}

export function getIcon(iconName?: IconName): LucideIcon | undefined {
    if (!iconName) return undefined
    return iconMap[iconName]
}

