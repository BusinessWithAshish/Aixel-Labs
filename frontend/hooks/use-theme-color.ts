'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/**
 * Theme Color Enum
 * 
 * To add a new color theme:
 * 1. Add the color to this enum (e.g., GREEN = 'green')
 * 2. Add CSS variables in globals.css:
 *    - .green { --primary: ...; --ring: ...; etc. } for light mode
 *    - .green-dark { --primary: ...; --ring: ...; etc. } for dark mode
 * 3. Add the option in account-settings/page.tsx themeColorOptions array
 * 
 * The hook will automatically handle applying the correct variant based on the current theme mode.
 */
export enum ThemeColor {
    DEFAULT = 'default',
    BLUE = 'blue',
    ROSE = 'rose',
    GREEN = 'green',
}

const THEME_COLOR_STORAGE_KEY = 'theme-color';

export function useThemeColor() {
    const { theme: mode, resolvedTheme } = useTheme();
    const [themeColor, setThemeColorState] = useState<ThemeColor>(ThemeColor.DEFAULT);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Load saved theme color from localStorage
        const saved = localStorage.getItem(THEME_COLOR_STORAGE_KEY) as ThemeColor | null;
        if (saved && Object.values(ThemeColor).includes(saved)) {
            setThemeColorState(saved);
        }
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const root = document.documentElement;
        
        // Remove all theme color classes
        Object.values(ThemeColor).forEach((color) => {
            root.classList.remove(color);
            root.classList.remove(`${color}-dark`);
        });

        // Don't apply any theme color if it's default
        if (themeColor === ThemeColor.DEFAULT) {
            return;
        }

        // Determine if we're in dark mode
        const isDark = resolvedTheme === 'dark';

        // Apply the appropriate theme color class
        if (isDark) {
            root.classList.add(`${themeColor}-dark`);
        } else {
            root.classList.add(themeColor);
        }
    }, [themeColor, resolvedTheme, mounted]);

    const setThemeColor = (color: ThemeColor) => {
        setThemeColorState(color);
        localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
    };

    return {
        themeColor,
        setThemeColor,
        mounted,
    };
}
