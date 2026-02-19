'use client';

import { useEffect, useState } from 'react';
import { useTenantBranding } from '@/contexts/TenantBranding';

/**
 * The theme system also supports a fully custom color that is applied by directly updating the CSS variables for `--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`, and `--sidebar-ring` on the document root.
 */

const THEME_COLOR_STORAGE_KEY = 'theme-color';

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB | null {
    const match = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const intVal = parseInt(match[1], 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return { r, g, b };
}

function rgbToString({ r, g, b }: RGB): string {
    return `rgb(${r}, ${g}, ${b})`;
}

function getRelativeLuminance({ r, g, b }: RGB): number {
    // Convert sRGB to linear RGB
    const srgb = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    const [R, G, B] = srgb;
    // Standard relative luminance formula
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastingForeground(rgb: RGB): string {
    const luminance = getRelativeLuminance(rgb);
    // Simple threshold: light colors get dark text, dark colors get light text
    return luminance > 0.5 ? 'rgb(15, 23, 42)' : 'rgb(248, 250, 252)';
}

function applyCustomColorVariables(root: HTMLElement, colorHex: string) {
    const rgb = hexToRgb(colorHex);
    if (!rgb) return;

    const primary = rgbToString(rgb);
    const foreground = getContrastingForeground(rgb);

    // Primary surface + text
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--primary-foreground', foreground);

    // Accent borders / focus ring
    root.style.setProperty('--ring', primary);

    // Sidebar accents
    root.style.setProperty('--sidebar-primary', primary);
    root.style.setProperty('--sidebar-ring', primary);
}

/**
 * Theme color hook.
 *
 * - Reads a user-specific custom color from localStorage (if set)
 * - Falls back to an optional tenant-wide default color
 * - Applies the effective color via CSS variables on the document root
 */
export function useThemeColor() {
    const { appThemeColor } = useTenantBranding();

    const [themeColor, setThemeColorState] = useState<string | null>(appThemeColor);

    useEffect(() => {
        // Load saved theme color from localStorage (client-only)
        const saved = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
        if (saved) {
            setThemeColorState(saved);
        }
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;

        // Clear any previous inline overrides for the dynamic color
        ['--primary', '--primary-foreground', '--ring', '--sidebar-primary', '--sidebar-ring'].forEach((varName) => {
            root.style.removeProperty(varName);
        });

        // Determine effective color: user custom override first, then tenant default
        const effectiveColor = themeColor;

        // Don't apply any theme color if neither custom nor tenant default is set
        if (!effectiveColor) {
            return;
        }

        applyCustomColorVariables(root, effectiveColor);
    }, [themeColor]);

    const setThemeColor = (color: string) => {
        if (!color) {
            setThemeColorState(null);
            localStorage.removeItem(THEME_COLOR_STORAGE_KEY);
            return;
        }
        setThemeColorState(color);
        localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
    };

    return {
        themeColor,
        setThemeColor,
    };
}
