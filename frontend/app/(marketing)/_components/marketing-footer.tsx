'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Mail, MapPin } from 'lucide-react';
import { DEFAULT_HOME_PAGE_ROUTE } from '@/config/app-config';
import {
    AIXEL_WORDMARK,
    APP_URL,
    CONTACT_EMAIL,
    CONTACT_MAILTO,
    EASE_OUT_EXPO,
    LABELS,
    REVEAL_VIEWPORT,
} from '../constants';
import { BookCallButton } from './booking';
import { SectionIn } from './primitives';

const FOOTER_LINKS = [
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: LABELS.startFree, href: APP_URL, external: true },
] as const;

export function MarketingFooter() {
    return (
        <footer className="relative overflow-hidden bg-primary text-primary-foreground">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background/20 to-transparent"
            />

            <SectionIn>
                <div className="relative mx-auto w-full max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:pt-24">
                    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={REVEAL_VIEWPORT}
                            transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
                        >
                            <Link href={DEFAULT_HOME_PAGE_ROUTE} className="inline-flex items-center">
                                <Image
                                    src={AIXEL_WORDMARK}
                                    alt="Aixel Labs"
                                    width={176}
                                    height={79}
                                    className="h-10 w-auto object-contain object-left brightness-0 invert"
                                />
                            </Link>
                            <p className="mt-4 max-w-sm text-sm leading-relaxed text-primary-foreground/70">
                                Lead management platform plus an AI automation agency. Find, enrich, and act on leads.
                                Or let us build the automations for you.
                            </p>
                            <div className="mt-5 flex flex-col gap-2 text-sm text-primary-foreground/65">
                                <a
                                    href={CONTACT_MAILTO}
                                    className="inline-flex items-center gap-2 transition-colors hover:text-primary-foreground"
                                >
                                    <Mail className="size-3.5" />
                                    {CONTACT_EMAIL}
                                </a>
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="size-3.5" />
                                    Pune, India · Available 24x7
                                </span>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={REVEAL_VIEWPORT}
                            transition={{ duration: 0.65, delay: 0.08, ease: EASE_OUT_EXPO }}
                        >
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/55">
                                Links
                            </p>
                            <ul className="mt-4 space-y-2.5">
                                {FOOTER_LINKS.map((l) => (
                                    <li key={l.label}>
                                        <Link
                                            href={l.href}
                                            {...('external' in l && l.external
                                                ? { target: '_blank', rel: 'noopener noreferrer' }
                                                : {})}
                                            className="text-sm text-primary-foreground/75 transition-colors hover:text-primary-foreground"
                                        >
                                            {l.label}
                                        </Link>
                                    </li>
                                ))}
                                <li>
                                    <BookCallButton className="text-sm text-primary-foreground/75 transition-colors hover:text-primary-foreground">
                                        {LABELS.bookCallShort}
                                    </BookCallButton>
                                </li>
                            </ul>
                        </motion.div>
                    </div>

                    <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-primary-foreground/15 py-6 text-xs text-primary-foreground/55 sm:flex-row sm:items-center">
                        <p>© {new Date().getFullYear()} Aixel Labs. All rights reserved.</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full bg-emerald-400" />
                                All systems operational
                            </span>
                            <span className="hidden text-primary-foreground/30 sm:inline">·</span>
                            <span>Pune, India</span>
                        </div>
                    </div>
                </div>
            </SectionIn>

            <motion.div
                aria-hidden
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
                className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pb-2 sm:px-6"
            >
                <p
                    className="select-none whitespace-nowrap text-center text-[17vw] font-semibold leading-[0.85] tracking-tighter text-primary-foreground/30 sm:text-[13vw] lg:text-[10.5rem]"
                    style={{
                        maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
                    }}
                >
                    Aixel Labs
                </p>
            </motion.div>
        </footer>
    );
}
