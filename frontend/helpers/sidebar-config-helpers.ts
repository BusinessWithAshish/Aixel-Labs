import { type ModuleAccess, Modules } from '@aixellabs/backend/db/types';
import { SubModuleUrls, ALWAYS_ALLOWED_PATHS, DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { SidebarConfig, SidebarNavItem, ADMIN_ONLY_PATHS } from '@/config/sidebar.config';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';

/**
 * Build sidebar nav from a ModuleAccess map (shared by admin full-access and non-admin grants).
 */
function buildSidebarFromModuleAccess(moduleAccess: ModuleAccess): SidebarConfig {
    const navMain: SidebarNavItem[] = [];

    // eslint-disable-next-line @next/next/no-assign-module-variable
    for (const module of Object.values(Modules)) {
        const subModules = moduleAccess[module];
        if (!subModules || subModules.length === 0) {
            continue;
        }

        navMain.push({
            title: module,
            items: subModules.map((subModule) => ({
                title: subModule,
                url: SubModuleUrls[subModule],
            })),
        });
    }

    return { navMain };
}

/**
 * Sidebar + path ACL from module access.
 * Admins ignore stored `moduleAccess` and use {@link getDefaultModuleAccess} (SSOT for “all modules”).
 * Non-admins with missing/empty map get no module nav.
 */
export function generateSidebarConfig(isAdmin: boolean, moduleAccess?: ModuleAccess): SidebarConfig {
    if (isAdmin) {
        return buildSidebarFromModuleAccess(getDefaultModuleAccess());
    }

    if (!moduleAccess) {
        return { navMain: [] };
    }

    return buildSidebarFromModuleAccess(moduleAccess);
}

/**
 * Extract all accessible paths from sidebar config (same logic as nav items).
 * Reuses generateSidebarConfig for single source of truth.
 */
export function getAccessiblePaths(isAdmin: boolean, moduleAccess?: ModuleAccess): Set<string> {
    const config = generateSidebarConfig(isAdmin, moduleAccess);
    const paths = new Set<string>();

    for (const item of config.navMain) {
        for (const sub of item.items ?? []) {
            paths.add(sub.url);
        }
    }
    return paths;
}

/**
 * Check if pathname is accessible (reuses sidebar config logic).
 * Admins get paths from getDefaultModuleAccess(); always-allowed + admin-only paths still apply.
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

    for (const allowed of allowedPaths) {
        if (normalized === allowed || normalized.startsWith(`${allowed}/`)) {
            return true;
        }
    }
    return false;
}
