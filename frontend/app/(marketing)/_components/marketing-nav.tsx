'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { ArrowRight, Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import { AIXEL_WORDMARK, LABELS, NAV_LINKS, SIGN_IN_URL } from '../constants';
import { StartFreeLink } from './booking';

export function MarketingNav() {
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);
    const { scrollY } = useScroll();
    const scrolledRef = useRef(false);

    useMotionValueEvent(scrollY, 'change', (y) => {
        // Hysteresis so the pill state does not flicker around the threshold
        const next = scrolledRef.current ? y > 12 : y > 40;
        if (next !== scrolledRef.current) {
            scrolledRef.current = next;
            setScrolled(next);
        }
    });

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-50">
                <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 sm:pt-4">
                    <div
                        className={cn(
                            'relative flex h-14 items-center justify-between gap-3 transition-all duration-300 ease-out sm:h-16',
                            scrolled || open
                                ? 'rounded-2xl border border-border/80 bg-background/85 px-3 shadow-xl shadow-black/5 dark:shadow-black/40 backdrop-blur-xl sm:px-4'
                                : 'rounded-none border border-transparent bg-transparent px-1 shadow-none',
                        )}
                    >
                        <div
                            aria-hidden
                            className={cn(
                                'pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-primary/5 blur-xl transition-opacity duration-300',
                                scrolled || open ? 'opacity-100' : 'opacity-0',
                            )}
                        />

                        <Link
                            href={DEFAULT_HOME_PAGE_ROUTE}
                            className="relative z-10 flex shrink-0 items-center overflow-visible"
                            onClick={() => setOpen(false)}
                        >
                            <Image
                                src={AIXEL_WORDMARK}
                                alt="Aixel Labs"
                                width={148}
                                height={66}
                                priority
                                className={cn(
                                    'h-8 w-auto object-contain object-left sm:h-9',
                                    scrolled && 'scale-[0.97]',
                                )}
                            />
                        </Link>

                        <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 md:flex">
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        'rounded-full px-3.5 py-2 text-sm transition-colors',
                                        scrolled
                                            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                            : 'text-muted-foreground/90 hover:text-foreground',
                                    )}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>

                        <div className="relative z-10 hidden items-center gap-2 md:flex">
                            <LandingThemeToggle />
                            <a
                                href={SIGN_IN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {LABELS.signIn}
                            </a>
                            <StartFreeLink className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-95">
                                {LABELS.startFree}
                                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                            </StartFreeLink>
                        </div>

                        <div className="relative z-10 flex items-center gap-2 md:hidden">
                            <LandingThemeToggle />
                            <button
                                type="button"
                                onClick={() => setOpen((v) => !v)}
                                className={cn(
                                    'grid size-9 place-items-center rounded-xl border text-foreground transition-colors',
                                    scrolled || open
                                        ? 'border-border bg-card'
                                        : 'border-border/60 bg-background/40 backdrop-blur-sm',
                                )}
                                aria-label="Toggle menu"
                                aria-expanded={open}
                            >
                                {open ? <X className="size-4" /> : <Menu className="size-4" />}
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {open ? (
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                                className="mt-2 overflow-hidden rounded-2xl border border-border/70 bg-background/90 p-3 shadow-xl shadow-primary/10 backdrop-blur-xl md:hidden"
                            >
                                <nav className="flex flex-col">
                                    {NAV_LINKS.map((link) => (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            onClick={() => setOpen(false)}
                                            className="block rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                                        <a
                                            href={SIGN_IN_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => setOpen(false)}
                                            className="rounded-xl px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                                        >
                                            {LABELS.signIn}
                                        </a>
                                        <StartFreeLink
                                            onClick={() => setOpen(false)}
                                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground"
                                        >
                                            {LABELS.startFree}
                                            <ArrowRight className="size-3.5" />
                                        </StartFreeLink>
                                    </div>
                                </nav>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
            </header>

            <div className="h-16 sm:h-18" aria-hidden />
        </>
    );
}

type DocumentWithViewTransition = Document & {
    startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/** One-click light ↔ dark with a circular wipe (View Transitions) or soft color fade. */
function LandingThemeToggle({ className }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = resolvedTheme === 'dark';

    function switchTheme() {
        const next = isDark ? 'light' : 'dark';
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const doc = document as DocumentWithViewTransition;

        const apply = () => {
            flushSync(() => setTheme(next));
        };

        if (reduceMotion || typeof doc.startViewTransition !== 'function') {
            document.documentElement.classList.add('theme-animating');
            apply();
            window.setTimeout(() => {
                document.documentElement.classList.remove('theme-animating');
            }, 480);
            return;
        }

        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
            document.documentElement.style.setProperty('--theme-tx', `${rect.left + rect.width / 2}px`);
            document.documentElement.style.setProperty('--theme-ty', `${rect.top + rect.height / 2}px`);
        }
        document.documentElement.dataset.themeTransition = next;

        const transition = doc.startViewTransition!(apply);
        void transition.finished.finally(() => {
            requestAnimationFrame(() => {
                delete document.documentElement.dataset.themeTransition;
            });
        });
    }

    if (!mounted) {
        return (
            <span
                aria-hidden
                className={cn(
                    'inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground',
                    className,
                )}
            >
                <Sun className="size-4" />
            </span>
        );
    }

    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={switchTheme}
            className={cn(
                'inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground transition-colors hover:border-primary/35 hover:bg-accent hover:text-foreground',
                className,
            )}
        >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
    );
}
