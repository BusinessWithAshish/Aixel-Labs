'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useTenantBranding } from '@/contexts/TenantBranding';
import { setThemeColorAction, clearThemeColorAction } from '@/app/actions/theme-actions';
import { applyThemeVarsToDom, clearThemeVarsFromDom, getCssVarsFromHex } from '@/helpers/theme-color-utils';

/** Delay before cookie + `revalidatePath` so dragging the color picker does not refetch the layout every tick. */
const THEME_COLOR_PERSIST_DEBOUNCE_MS = 450;

type PendingPersist = 'clear' | { set: string };

/**
 * Reads and updates the user's theme color preference.
 *
 * - Initial value comes from the server (cookie ?? tenant default) — no flicker.
 * - DOM updates apply immediately; cookie + layout revalidation are debounced.
 * - Passing the tenant's defaultThemeColor (or empty string) resets the override.
 */
export function useThemeColor() {
    const { themeColor: initialColor, defaultThemeColor } = useTenantBranding();

    const [themeColor, setThemeColorState] = useState(initialColor);
    const [isPending, startTransition] = useTransition();
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingPersistRef = useRef<PendingPersist | null>(null);

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
            }
            const pending = pendingPersistRef.current;
            pendingPersistRef.current = null;
            if (pending === 'clear') {
                void clearThemeColorAction();
            } else if (pending && getCssVarsFromHex(pending.set)) {
                void setThemeColorAction(pending.set);
            }
        };
    }, []);

    const setThemeColor = (color: string) => {
        const isReset = !color || color === defaultThemeColor;
        const resolvedState = isReset ? defaultThemeColor : color;

        setThemeColorState(resolvedState);

        if (isReset) {
            clearThemeVarsFromDom(document.documentElement);
            pendingPersistRef.current = 'clear';
        } else {
            applyThemeVarsToDom(document.documentElement, color);
            pendingPersistRef.current = getCssVarsFromHex(color) ? { set: color } : null;
        }

        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
        }

        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null;
            const pending = pendingPersistRef.current;
            pendingPersistRef.current = null;

            startTransition(() => {
                if (pending === 'clear') {
                    void clearThemeColorAction();
                } else if (pending && getCssVarsFromHex(pending.set)) {
                    void setThemeColorAction(pending.set);
                }
            });
        }, THEME_COLOR_PERSIST_DEBOUNCE_MS);
    };

    return { themeColor, setThemeColor, isPending };
}
