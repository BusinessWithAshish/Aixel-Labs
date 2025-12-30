import {
    Modules,
    LEAD_GENERATION_SUB_MODULES,
    VOICE_AGENT_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    EMAIL_SUB_MODULES,
    type ModuleAccess,
    type SubModule,
} from '@aixellabs/shared/mongodb';

/**
 * Get all available submodules for a given module
 */
export function getSubModulesForModule(module: Modules): SubModule[] {
    switch (module) {
        case Modules.LEAD_GENERATION:
            return Object.values(LEAD_GENERATION_SUB_MODULES);
        case Modules.VOICE_AGENT:
            return Object.values(VOICE_AGENT_SUB_MODULES);
        case Modules.MESSAGING:
            return Object.values(MESSAGING_SUB_MODULES);
        case Modules.EMAIL:
            return Object.values(EMAIL_SUB_MODULES);
        default:
            const _exhaustive: never = module;
            return [];
    }
}

/**
 * Get default module access (all modules and submodules enabled)
 */
export function getDefaultModuleAccess(): ModuleAccess {
    return {
        [Modules.LEAD_GENERATION]: Object.values(LEAD_GENERATION_SUB_MODULES),
        [Modules.VOICE_AGENT]: Object.values(VOICE_AGENT_SUB_MODULES),
        [Modules.MESSAGING]: Object.values(MESSAGING_SUB_MODULES),
        [Modules.EMAIL]: Object.values(EMAIL_SUB_MODULES),
    };
}

/**
 * Check if a user has access to a specific module
 */
export function hasModuleAccess(moduleAccess: ModuleAccess | undefined, module: Modules): boolean {
    // If no module access defined, deny access (unless handled at admin level)
    if (!moduleAccess) return false;

    // Check if module exists and has at least one submodule
    const subModules = moduleAccess[module];
    return !!subModules && subModules.length > 0;
}

/**
 * Check if a user has access to a specific submodule
 */
export function hasSubModuleAccess(moduleAccess: ModuleAccess | undefined, module: Modules, subModule: SubModule): boolean {
    if (!moduleAccess) return false;

    const subModules = moduleAccess[module] as SubModule[] | undefined;
    if (!subModules) return false;

    return subModules.includes(subModule);
}

/**
 * Toggle a submodule in module access
 */
export function toggleSubModule(moduleAccess: ModuleAccess, module: Modules, subModule: SubModule): ModuleAccess {
    const currentSubModules = (moduleAccess[module] || []) as SubModule[];
    const hasAccess = currentSubModules.includes(subModule);

    if (hasAccess) {
        // Remove submodule
        const filtered = currentSubModules.filter((sm) => sm !== subModule);
        return {
            ...moduleAccess,
            [module]: filtered,
        };
    } else {
        // Add submodule
        const updated = [...currentSubModules, subModule];
        return {
            ...moduleAccess,
            [module]: updated,
        };
    }
}

/**
 * Toggle all submodules for a module
 */
export function toggleAllSubModules(moduleAccess: ModuleAccess, module: Modules, enabled: boolean): ModuleAccess {
    if (enabled) {
        return {
            ...moduleAccess,
            [module]: getSubModulesForModule(module),
        };
    } else {
        return {
            ...moduleAccess,
            [module]: [],
        };
    }
}

/**
 * Check if all submodules are enabled for a module
 */
export function areAllSubModulesEnabled(moduleAccess: ModuleAccess | undefined, module: Modules): boolean {
    if (!moduleAccess) return false;

    const currentSubModules = (moduleAccess[module] || []) as SubModule[];
    const allSubModules = getSubModulesForModule(module);

    return currentSubModules.length === allSubModules.length && allSubModules.every((sm) => currentSubModules.includes(sm));
}

/**
 * Check if some (but not all) submodules are enabled for a module
 */
export function areSomeSubModulesEnabled(moduleAccess: ModuleAccess | undefined, module: Modules): boolean {
    if (!moduleAccess) return false;

    const currentSubModules = moduleAccess[module] || [];
    return currentSubModules.length > 0 && currentSubModules.length < getSubModulesForModule(module).length;
}
