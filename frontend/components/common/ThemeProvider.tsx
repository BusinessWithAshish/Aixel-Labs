'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: string;
    storageKey?: string;
};

export const ThemeProvider = ({ children, defaultTheme = 'system', storageKey = 'theme' }: ThemeProviderProps) => {
    return (
        <NextThemesProvider attribute="class" defaultTheme={defaultTheme} storageKey={storageKey} enableSystem>
            {children}
        </NextThemesProvider>
    );
};
