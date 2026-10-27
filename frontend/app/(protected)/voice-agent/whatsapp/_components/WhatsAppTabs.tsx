'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Inbox, MessageCircleMore } from 'lucide-react';
import { WHATSAPP_AGENTS_URL, WHATSAPP_NUMBERS_URL, WHATSAPP_URL } from '@/helpers/voice-routes';
import { cn } from '@/lib/utils';

const BASE = WHATSAPP_URL;

/** The WhatsApp section's parts: its own inbox, agents and numbers (API keys stay shared, under Settings). */
const WHATSAPP_TABS = [
    { href: BASE, label: 'Inbox', icon: Inbox },
    { href: WHATSAPP_AGENTS_URL, label: 'Agents', icon: Bot },
    { href: WHATSAPP_NUMBERS_URL, label: 'Numbers', icon: MessageCircleMore },
] as const;

export function WhatsAppTabs() {
    const pathname = usePathname();
    return (
        <nav aria-label="WhatsApp" className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-fit">
            {WHATSAPP_TABS.map(({ href, label, icon: Icon }) => {
                const active = href === BASE ? pathname === BASE : pathname.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none',
                            active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className="size-4" aria-hidden />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
