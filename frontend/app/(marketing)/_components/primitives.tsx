'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE_OUT_EXPO, REVEAL_VIEWPORT } from '../constants';
import type { SectionId } from '../types';

/* -------------------------------------------------------------------------- */
/* Section chrome                                                             */
/* -------------------------------------------------------------------------- */

type LandingSectionProps = {
    id?: SectionId | string;
    /** `default` = bg-background, `muted` = bg-primary/5 */
    tone?: 'default' | 'muted';
    overflow?: boolean;
    className?: string;
    innerClassName?: string;
    /** Rendered inside the section but outside the max-width container (glows, grids). */
    atmosphere?: ReactNode;
    /** Section-level fade/rise on scroll. Default on. */
    animateIn?: boolean;
    /** Delay for the section entrance (seconds). */
    inDelay?: number;
    children: ReactNode;
};

/** Standard landing section chrome: vertical rhythm + max-width container + scroll-in. */
export function LandingSection({
    id,
    tone = 'default',
    overflow = false,
    className,
    innerClassName,
    atmosphere,
    animateIn = true,
    inDelay = 0,
    children,
}: LandingSectionProps) {
    const inner = (
        <div className={cn('relative mx-auto w-full max-w-7xl px-4 sm:px-6', innerClassName)}>{children}</div>
    );

    return (
        <section
            id={id}
            className={cn(
                'relative py-20 sm:py-28',
                tone === 'muted' ? 'bg-primary/5' : 'bg-background',
                overflow && 'overflow-hidden',
                className,
            )}
        >
            {atmosphere}
            {animateIn ? (
                <SectionIn delay={inDelay} className="w-full">
                    {inner}
                </SectionIn>
            ) : (
                inner
            )}
        </section>
    );
}

export function SectionEyebrow({
    children,
    className,
    muted,
}: {
    children: ReactNode;
    className?: string;
    muted?: boolean;
}) {
    return (
        <p
            className={cn(
                'text-xs font-medium uppercase tracking-[0.2em]',
                muted ? 'text-muted-foreground' : 'text-primary',
                className,
            )}
        >
            {children}
        </p>
    );
}

/* -------------------------------------------------------------------------- */
/* Scroll reveals                                                             */
/* -------------------------------------------------------------------------- */

type RevealProps = {
    children: ReactNode;
    className?: string;
    delay?: number;
    y?: number;
    as?: 'div' | 'section' | 'li' | 'span' | 'header' | 'footer';
    once?: boolean;
};

/** Fade + rise used inside sections for headers, cards, and blocks. */
export function Reveal({ children, className, delay = 0, y = 28, as = 'div', once = true }: RevealProps) {
    const MotionTag = motion[as] as typeof motion.div;
    const variants: Variants = {
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0 },
    };
    return (
        <MotionTag
            className={className}
            initial="hidden"
            whileInView="visible"
            viewport={{ ...REVEAL_VIEWPORT, once }}
            transition={{ duration: 0.7, delay, ease: EASE_OUT_EXPO }}
            variants={variants}
        >
            {children}
        </MotionTag>
    );
}

/** Whole-section entrance — wrap LandingSection content (and one-off sections). */
export function SectionIn({
    children,
    className,
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
}) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 48 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={REVEAL_VIEWPORT}
            transition={{ duration: 0.85, delay, ease: EASE_OUT_EXPO }}
        >
            {children}
        </motion.div>
    );
}

export function StaggerGroup({
    children,
    className,
    stagger = 0.1,
    once = true,
}: {
    children: ReactNode;
    className?: string;
    stagger?: number;
    once?: boolean;
}) {
    return (
        <motion.div
            className={className}
            initial="hidden"
            whileInView="visible"
            viewport={{ ...REVEAL_VIEWPORT, once }}
            variants={{
                hidden: {},
                visible: { transition: { staggerChildren: stagger, delayChildren: 0.08 } },
            }}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({
    children,
    className,
    y = 24,
}: {
    children: ReactNode;
    className?: string;
    y?: number;
}) {
    return (
        <motion.div
            className={className}
            variants={{
                hidden: { opacity: 0, y },
                visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
        >
            {children}
        </motion.div>
    );
}

/* -------------------------------------------------------------------------- */
/* Count-up                                                                   */
/* -------------------------------------------------------------------------- */

type CountUpProps = {
    to: number;
    from?: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    className?: string;
};

export function CountUp({
    to,
    from = 0,
    duration = 1.6,
    prefix = '',
    suffix = '',
    decimals = 0,
    className,
}: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: '-60px 0px -60px 0px' });
    const [value, setValue] = useState(from);

    useEffect(() => {
        if (!inView) return;
        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / (duration * 1000));
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(from + (to - from) * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [inView, to, from, duration]);

    const formatted = value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    return (
        <span ref={ref} className={className}>
            {prefix}
            {formatted}
            {suffix}
        </span>
    );
}
