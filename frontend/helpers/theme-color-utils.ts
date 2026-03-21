type RGB = { r: number; g: number; b: number };

export const THEME_COLOR_COOKIE_KEY = 'theme-color';

function hexToRgb(hex: string): RGB | null {
    const match = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const intVal = parseInt(match[1], 16);
    return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255,
    };
}

function rgbToString({ r, g, b }: RGB): string {
    return `rgb(${r}, ${g}, ${b})`;
}

function getRelativeLuminance({ r, g, b }: RGB): number {
    const [R, G, B] = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getContrastingForeground(rgb: RGB): string {
    return getRelativeLuminance(rgb) > 0.5 ? 'rgb(15, 23, 42)' : 'rgb(248, 250, 252)';
}

export type ThemeCssVars = {
    '--primary': string;
    '--primary-foreground': string;
    '--ring': string;
    '--sidebar-primary': string;
    '--sidebar-ring': string;
};

/**
 * Converts a hex color string into the full set of CSS variable values needed
 * for the theme. Returns null if the hex is invalid.
 */
export function getCssVarsFromHex(hex: string): ThemeCssVars | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;

    const primary = rgbToString(rgb);
    const foreground = getContrastingForeground(rgb);

    return {
        '--primary': primary,
        '--primary-foreground': foreground,
        '--ring': primary,
        '--sidebar-primary': primary,
        '--sidebar-ring': primary,
    };
}

/**
 * Builds an inline CSS string (for a <style> tag) that sets the theme CSS
 * variables on :root for a given hex color. Returns an empty string if invalid.
 */
export function buildThemeStyleTag(hex: string): string {
    const vars = getCssVarsFromHex(hex);
    if (!vars) return '';

    const declarations = (Object.entries(vars) as [string, string][]).map(([k, v]) => `  ${k}: ${v};`).join('\n');

    return `:root {\n${declarations}\n}`;
}

/**
 * Applies theme CSS variables directly to a DOM element (client-side only).
 */
export function applyThemeVarsToDom(root: HTMLElement, hex: string): void {
    const vars = getCssVarsFromHex(hex);
    if (!vars) return;
    for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
    }
}

/**
 * Removes all theme CSS variable overrides from a DOM element (client-side only).
 */
export function clearThemeVarsFromDom(root: HTMLElement): void {
    const keys: (keyof ThemeCssVars)[] = [
        '--primary',
        '--primary-foreground',
        '--ring',
        '--sidebar-primary',
        '--sidebar-ring',
    ];
    for (const key of keys) {
        root.style.removeProperty(key);
    }
}
