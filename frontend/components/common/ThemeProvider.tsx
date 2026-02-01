'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: 'light' | 'dark';
    storageKey?: string;
};

export const ThemeProvider = ({ children, defaultTheme = 'light', storageKey = 'theme' }: ThemeProviderProps) => {

    return (
        <NextThemesProvider attribute="class" themes={['light', 'dark']} disableTransitionOnChange={true} defaultTheme={defaultTheme} storageKey={storageKey} enableSystem>
            {children}
        </NextThemesProvider>
    );
};
