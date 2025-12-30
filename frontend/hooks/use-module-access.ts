'use client';

import { useSession } from 'next-auth/react';
import { 
    Modules, 
    type ModuleAccess,
    type SubModule 
} from '@aixellabs/shared/mongodb';
import { 
    hasModuleAccess, 
    hasSubModuleAccess 
} from '@/helpers/module-access-helpers';

/**
 * Hook to check user's module and submodule access
 * Returns helper functions to check access permissions
 */
export function useModuleAccess() {
    const { data: session } = useSession();
    
    const isAdmin = session?.user?.isAdmin ?? false;
    const moduleAccess = session?.user?.moduleAccess;

    /**
     * Check if user has access to a specific module
     * Admins always have access
     */
    const canAccessModule = (module: Modules): boolean => {
        if (isAdmin) return true;
        return hasModuleAccess(moduleAccess, module);
    };

    /**
     * Check if user has access to a specific submodule
     * Admins always have access
     */
    const canAccessSubModule = (module: Modules, subModule: SubModule): boolean => {
        if (isAdmin) return true;
        return hasSubModuleAccess(moduleAccess, module, subModule);
    };

    /**
     * Get the current user's module access configuration
     */
    const getUserModuleAccess = (): ModuleAccess | undefined => {
        return moduleAccess;
    };

    return {
        isAdmin,
        moduleAccess,
        canAccessModule,
        canAccessSubModule,
        getUserModuleAccess,
    };
}


