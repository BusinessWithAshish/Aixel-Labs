'use client';

import { DEFAULT_LOGO_SRC, DEFAULT_THEME_COLOR } from '@/config/app-config';
import { createContext, useContext } from 'react';

type TenantBrandingContextValue = {
    appLogoUrl: string;
    appThemeColor: string;
};

export const normalizeLogo = (value?: string) => {
    if (!value) return DEFAULT_LOGO_SRC;
    const trimmed = value.trim();
    return trimmed.length === 0 ? DEFAULT_LOGO_SRC : trimmed;
};

const normalizeThemeColor = (value?: string) => {
    if (!value) return DEFAULT_THEME_COLOR;
    const trimmed = value.trim();
    return trimmed.length === 0 ? DEFAULT_THEME_COLOR : trimmed;
};

const TenantBrandingContext = createContext<TenantBrandingContextValue>({
    appLogoUrl: DEFAULT_LOGO_SRC,
    appThemeColor: DEFAULT_THEME_COLOR,
});

type TenantBrandingProviderProps = {
    children: React.ReactNode;
    appLogoUrl?: string;
    appThemeColor?: string;
};

export const TenantBrandingProvider = ({ children, appLogoUrl, appThemeColor }: TenantBrandingProviderProps) => {
    return (
        <TenantBrandingContext.Provider
            value={{
                appLogoUrl: normalizeLogo(appLogoUrl),
                appThemeColor: normalizeThemeColor(appThemeColor),
            }}
        >
            {children}
        </TenantBrandingContext.Provider>
    );
};

export const useTenantBranding = () => {
    return useContext(TenantBrandingContext);
};

