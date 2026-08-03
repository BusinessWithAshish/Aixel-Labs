'use client';

import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useTheme } from 'next-themes';

type DocumentWithViewTransition = Document & {
    startViewTransition?: (update: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
    };
};

/**
 * Smooth light ↔ dark via View Transitions clip-path (falls back to instant swap).
 * Pair with ThemeProvider `disableTransitionOnChange` so per-element color
 * transitions don't fight the wipe and feel sticky.
 */
export function useSmoothThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const toggleTheme = useCallback(
        (origin?: HTMLElement | null) => {
            const next = isDark ? 'light' : 'dark';
            const doc = document as DocumentWithViewTransition;
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            if (reduceMotion || typeof doc.startViewTransition !== 'function' || !origin) {
                setTheme(next);
                return;
            }

            const { top, left, width, height } = origin.getBoundingClientRect();
            const x = left + width / 2;
            const y = top + height / 2;
            const right = window.innerWidth - left;
            const bottom = window.innerHeight - top;
            const maxRadius = Math.hypot(Math.max(left, right), Math.max(top, bottom));

            document.documentElement.dataset.themeTransition = next;

            const transition = doc.startViewTransition!(() => {
                flushSync(() => setTheme(next));
            });

            void transition.ready
                .then(() => {
                    document.documentElement.animate(
                        {
                            clipPath: [
                                `circle(0px at ${x}px ${y}px)`,
                                `circle(${maxRadius}px at ${x}px ${y}px)`,
                            ],
                        },
                        {
                            duration: 560,
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            pseudoElement: '::view-transition-new(root)',
                        },
                    );
                })
                .catch(() => {
                    // Animation rejected — theme already applied
                });

            void transition.finished.finally(() => {
                delete document.documentElement.dataset.themeTransition;
            });
        },
        [isDark, setTheme],
    );

    return { isDark, toggleTheme, resolvedTheme, setTheme };
}
