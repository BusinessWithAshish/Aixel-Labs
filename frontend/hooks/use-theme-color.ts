'use client';

import { useState, useTransition } from 'react';
import { useTenantBranding } from '@/contexts/TenantBranding';
import { setThemeColorAction, clearThemeColorAction } from '@/app/actions/theme-actions';
import { applyThemeVarsToDom, clearThemeVarsFromDom } from '@/helpers/theme-color-utils';

/**
 * Reads and updates the user's theme color preference.
 *
 * - Initial value comes from the server (cookie ?? tenant default) — no flicker.
 * - Changes apply optimistically to the DOM, then persist via a server action cookie.
 * - Passing the tenant's defaultThemeColor (or empty string) resets the override.
 */
export function useThemeColor() {
    const { themeColor: initialColor, defaultThemeColor } = useTenantBranding();

    const [themeColor, setThemeColorState] = useState(initialColor);
    const [isPending, startTransition] = useTransition();

    const setThemeColor = (color: string) => {
        const isReset = !color || color === defaultThemeColor;

        setThemeColorState(isReset ? defaultThemeColor : color);

        if (isReset) {
            clearThemeVarsFromDom(document.documentElement);
            startTransition(() => clearThemeColorAction());
        } else {
            applyThemeVarsToDom(document.documentElement, color);
            startTransition(() => setThemeColorAction(color));
        }
    };

    return { themeColor, setThemeColor, isPending };
}
