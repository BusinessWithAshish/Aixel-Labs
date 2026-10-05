'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** A board this wide or wider (tablets, landscape) shows more on each tile: the `bb-wide` rules in business.css. */
const WIDE_BOARD_PX = 520;

/** `useLayoutEffect` sizes the board before it is painted; on the server there is nothing to measure. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Sizes the board from the room its area has. The board is the largest square that fits, and
 * `--u` is one hundredth of its side: every size on the board is a multiple of it.
 *
 * Measured here rather than with CSS container units, which phones and tablets from before
 * 2022 do not have. Written straight to the element, so resizing never re-renders the board.
 */
export function useBoardUnit<T extends HTMLElement>(): RefObject<T | null> {
    const area = useRef<T>(null);
    useBrowserLayoutEffect(() => {
        const el = area.current;
        if (!el) return;
        const measure = () => {
            const side = Math.min(el.clientWidth, el.clientHeight);
            if (!side) return;
            el.style.setProperty('--u', `${side / 100}px`);
            el.classList.toggle('bb-wide', side >= WIDE_BOARD_PX);
        };
        measure();
        // Older browsers have no ResizeObserver: the window changing size covers rotation and resizing there.
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return area;
}
