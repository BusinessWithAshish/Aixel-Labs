'use client';

import { useEffect } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { SCROLL_HASH_SECTIONS, SECTION_IDS } from '../constants';

export function ScrollProgress() {
    const { scrollYProgress } = useScroll();
    const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

    return (
        <motion.div
            aria-hidden
            style={{ scaleX }}
            className="fixed left-0 top-0 z-[60] h-0.5 w-full origin-left bg-primary"
        />
    );
}

/**
 * Keeps the URL hash in sync with the section in view.
 * Hero clears the hash so the path stays clean (`/`).
 */
export function ScrollHashSync() {
    useEffect(() => {
        let frame = 0;
        let last = window.location.hash;

        const sync = () => {
            frame = 0;
            const marker = window.scrollY + Math.min(160, window.innerHeight * 0.22);

            let active: string = SECTION_IDS.hero;
            for (const id of SCROLL_HASH_SECTIONS) {
                const el = document.getElementById(id);
                if (!el) continue;
                const top = el.getBoundingClientRect().top + window.scrollY;
                if (top <= marker) active = id;
            }

            const next = active === SECTION_IDS.hero ? '' : `#${active}`;
            if (next === last) return;
            last = next;

            const path = `${window.location.pathname}${window.location.search}`;
            window.history.replaceState(null, '', next ? `${path}${next}` : path);
        };

        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(sync);
        };

        sync();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    return null;
}
