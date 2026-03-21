import { type ModuleAccess, Modules } from '@aixellabs/backend/db/types';
import { SubModuleUrls, ModuleUrls, ALWAYS_ALLOWED_PATHS, DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { sidebarConfig, SidebarConfig, SidebarNavItem, ADMIN_ONLY_PATHS } from '@/config/sidebar.config';

/**
 * Generate sidebar config based on user's module access
 * If user is admin or has no moduleAccess defined, return full config
 */
export function generateSidebarConfig(isAdmin: boolean, moduleAccess?: ModuleAccess): SidebarConfig {
    // Admins get full access
    if (isAdmin) {
        return getFullSidebarConfig();
    }

    // If no module access defined, return empty config (no access)
    if (!moduleAccess) {
        return { navMain: [] };
    }

    const navMain: SidebarNavItem[] = [];

    // Process each module
    // eslint-disable-next-line @next/next/no-assign-module-variable
    for (const module of Object.values(Modules)) {
        const subModules = moduleAccess[module];

        // Skip if module has no submodules enabled
        if (!subModules || subModules.length === 0) {
            continue;
        }

        // Build submodule items
        const items = subModules.map((subModule) => ({
            title: subModule,
            url: SubModuleUrls[subModule],
        }));

        navMain.push({
            title: module,
            url: ModuleUrls[module],
            items,
        });
    }

    return { navMain };
}

/**
 * Get full sidebar config with all modules and submodules
 */
function getFullSidebarConfig(): SidebarConfig {
    return sidebarConfig;
}

/**
 * Extract all accessible paths from sidebar config (same logic as nav items).
 * Reuses generateSidebarConfig for single source of truth.
 */
export function getAccessiblePaths(isAdmin: boolean, moduleAccess?: ModuleAccess): Set<string> {
    const config = generateSidebarConfig(isAdmin, moduleAccess);
    const paths = new Set<string>();

    for (const item of config.navMain) {
        paths.add(item.url);
        for (const sub of item.items ?? []) {
            paths.add(sub.url);
        }
    }
    return paths;
}

/**
 * Check if pathname is accessible (reuses sidebar config logic).
 * Admins bypass; always-allowed paths pass; module paths checked via getAccessiblePaths.
 */
function isAdminOnlyPathAccessible(normalized: string, isAdmin: boolean): boolean {
    if (!isAdmin) return false;
    for (const path of ADMIN_ONLY_PATHS) {
        if (normalized === path) return true;
        if (normalized.startsWith(path + '/')) return true;
    }
    return false;
}

export function isPathAccessible(pathname: string, isAdmin: boolean, moduleAccess?: ModuleAccess): boolean {
    const normalized = pathname.replace(/\/$/, '') || DEFAULT_HOME_PAGE_ROUTE;

    if (ALWAYS_ALLOWED_PATHS.includes(normalized as (typeof ALWAYS_ALLOWED_PATHS)[number])) {
        return true;
    }

    if (isAdminOnlyPathAccessible(normalized, isAdmin)) return true;

    const allowedPaths = getAccessiblePaths(isAdmin, moduleAccess);
    if (allowedPaths.has(normalized)) return true;

    // Allow nested routes under an accessible path (e.g. /lead-generation/google-maps/...)
    for (const allowed of allowedPaths) {
        if (normalized === allowed || normalized.startsWith(`${allowed}/`)) {
            return true;
        }
    }
    return false;
}
