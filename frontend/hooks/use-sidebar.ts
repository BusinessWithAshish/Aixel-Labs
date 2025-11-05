/**
 * @deprecated This hook is deprecated. Import sidebarConfig directly from @/config/sidebar.config instead.
 * This file is kept for backward compatibility only.
 */
import { sidebarConfig } from "@/config/sidebar.config"

export const LEFT_SIDEBAR_MENU = sidebarConfig

export const useSidebar = () => {
    return sidebarConfig
}