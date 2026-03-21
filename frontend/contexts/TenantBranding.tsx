'use client';

import { DEFAULT_LOGO_SRC, DEFAULT_THEME_COLOR } from '@/config/app-config';
import { createContext, useContext } from 'react';

type TenantBrandingContextValue = {
    appLogoUrl: string;
    /** Active color: user's saved cookie preference, or the tenant default. */
    themeColor: string;
    /** Tenant's MongoDB-configured default — the target when the user hits reset. */
    defaultThemeColor: string;
};

export const normalizeLogo = (value?: string) => {
    const trimmed = value?.trim();
    return trimmed?.length ? trimmed : DEFAULT_LOGO_SRC;
};

const TenantBrandingContext = createContext<TenantBrandingContextValue>({
    appLogoUrl: DEFAULT_LOGO_SRC,
    themeColor: DEFAULT_THEME_COLOR,
    defaultThemeColor: DEFAULT_THEME_COLOR,
});

type TenantBrandingProviderProps = {
    children: React.ReactNode;
    appLogoUrl?: string;
    /** Tenant's configured color from MongoDB. Falls back to DEFAULT_THEME_COLOR. */
    defaultThemeColor?: string;
    /** Pre-resolved active color (cookie ?? tenant default). */
    themeColor: string;
};

export const TenantBrandingProvider = ({
    children,
    appLogoUrl,
    defaultThemeColor,
    themeColor,
}: TenantBrandingProviderProps) => {
    const resolvedDefault = defaultThemeColor?.trim() || DEFAULT_THEME_COLOR;
    return (
        <TenantBrandingContext.Provider
            value={{
                appLogoUrl: normalizeLogo(appLogoUrl),
                defaultThemeColor: resolvedDefault,
                themeColor: themeColor?.trim() || resolvedDefault,
            }}
        >
            {children}
        </TenantBrandingContext.Provider>
    );
};

export const useTenantBranding = () => useContext(TenantBrandingContext);
