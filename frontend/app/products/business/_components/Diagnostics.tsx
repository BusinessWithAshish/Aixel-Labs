'use client';

import { useEffect, useState } from 'react';
import { supportsFlexGap } from '../_lib/client';

const REFRESH_MS = 2000;

/** CSS the game relies on, or falls back from: what this browser says it supports. */
const CSS_CHECKS: [string, string, string][] = [
    ['variables', '--x', '1px'],
    ['grid', 'display', 'grid'],
    ['calc with a variable', 'width', 'calc(2 * var(--u))'],
    ['container units', 'width', '1cqw'],
    ['dvh', 'height', '1dvh'],
    ['inset', 'inset', '0'],
    ['color-mix', 'color', 'color-mix(in srgb, red 50%, blue)'],
    ['min()', 'width', 'min(1px, 2px)'],
];

const size = (el: Element | null) => {
    if (!el) return 'not on screen';
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)} x ${Math.round(r.height)}`;
};

function report(): string[] {
    const area = document.querySelector<HTMLElement>('.board-area');
    const band = document.querySelector<HTMLElement>('.tile .band:not(.sign)');
    const can = (prop: string, value: string) => (typeof CSS !== 'undefined' && CSS.supports ? (CSS.supports(prop, value) ? 'yes' : 'NO') : 'unknown');
    return [
        navigator.userAgent,
        `screen ${window.innerWidth} x ${window.innerHeight}, pixel ratio ${window.devicePixelRatio}`,
        ...CSS_CHECKS.map(([name, prop, value]) => `${name}: ${can(prop, value)}`),
        `flex gap: ${supportsFlexGap() ? 'yes' : 'NO'}`,
        `ResizeObserver: ${typeof ResizeObserver === 'undefined' ? 'NO' : 'yes'}`,
        `board area ${size(area)}, board ${size(document.querySelector('.board'))}`,
        `unit --u: ${area ? area.style.getPropertyValue('--u') || 'not set' : 'no board'}`,
        `tile ${size(document.querySelector('.tile.s-bottom'))}, colour band ${size(band)}`,
        `band colour: ${band ? getComputedStyle(band).backgroundColor : 'no band'}, display: ${band ? getComputedStyle(band).display : '-'}, flex: ${band ? getComputedStyle(band).flex : '-'}`,
    ];
}

/**
 * Shown when the address ends in `?diag=1`: what this browser supports and how the board measured
 * up, so a player on an unusual device can send one screenshot instead of describing the problem.
 */
export function Diagnostics() {
    const [lines, setLines] = useState<string[]>([]);
    useEffect(() => {
        const refresh = () => setLines(report());
        refresh();
        const timer = window.setInterval(refresh, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, []);
    return (
        <pre className="diag" aria-label="Device diagnostics">
            {lines.join('\n')}
        </pre>
    );
}
