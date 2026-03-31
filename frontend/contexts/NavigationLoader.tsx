'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { eventBus } from '@/lib/event-bus';
import { CommonLoader } from '@/components/common/CommonLoader';

type NavigationLoaderContextType = {
    isLoading: boolean;
};

const NavigationLoaderContext = createContext<NavigationLoaderContextType>({ isLoading: false });

export function NavigationLoaderProvider({ children }: { children: React.ReactNode }) {
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const unsubscribe = eventBus.subscribe('navigation:loading', (loading) => {
            setIsLoading(loading);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    if (isLoading) {
        return <CommonLoader />;
    }

    return <NavigationLoaderContext.Provider value={{ isLoading }}>{children}</NavigationLoaderContext.Provider>;
}

export const useNavigationLoader = () => useContext(NavigationLoaderContext);