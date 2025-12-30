import { type ModuleAccess, Modules } from '@aixellabs/shared/mongodb';
import { SubModuleUrls, ModuleUrls } from '@/config/app-config';
import { sidebarConfig, SidebarConfig, SidebarNavItem } from '@/config/sidebar.config';

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
