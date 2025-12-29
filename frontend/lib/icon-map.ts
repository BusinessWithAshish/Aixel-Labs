import {
    AudioWaveform,
    GalleryVerticalEnd,
    Mail,
    MessageCircleMore,
    Settings2,
    UsersRound,
    type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/config/sidebar.config';
import { Modules } from '@aixellabs/shared/mongodb';
import { sidebarConfig } from '@/config/sidebar.config';

export const iconMap: Record<IconName, LucideIcon> = {
    UsersRound,
    AudioWaveform,
    MessageCircleMore,
    Mail,
    Settings2,
    GalleryVerticalEnd,
};

export function getIcon(iconName?: IconName): LucideIcon | undefined {
    if (!iconName) return undefined;
    return iconMap[iconName];
}

/**
 * Get the icon name for a module from the sidebar configuration
 */
export function getModuleIconName(module: Modules): IconName | undefined {
    const navItem = sidebarConfig.navMain.find((item) => item.title === module);
    return navItem?.icon;
}

/**
 * Get the icon component for a module
 */
export function getModuleIcon(module: Modules): LucideIcon | undefined {
    const iconName = getModuleIconName(module);
    return getIcon(iconName);
}
