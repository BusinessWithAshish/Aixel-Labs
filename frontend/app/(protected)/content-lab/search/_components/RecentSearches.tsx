'use client';

import Link from 'next/link';
import { AtSign, Hash, Link2, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { useRecentSearches } from '../_hooks/use-recent-searches';

const KIND_ICON = { topic: Hash, creator: AtSign, link: Link2 } as const;

/** The last searches run on this device as chips, one click to run again; nothing until there is one. */
export function RecentSearches({ className }: { className?: string }) {
    const { recent, remove, clear, add } = useRecentSearches();
    if (!recent.length) return null;

    return (
        <section aria-labelledby="recent-searches" className={cn('flex min-w-0 flex-col gap-2', className)}>
            <div className="flex items-center gap-2">
                <h2 id="recent-searches" className="text-muted-foreground text-xs font-medium">
                    Recent searches
                </h2>
                <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground ml-auto text-xs font-medium">
                    Clear
                </button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {recent.map((item) => {
                    const Icon = KIND_ICON[item.kind];
                    return (
                        <li key={item.href} className="bg-card flex max-w-full min-w-0 items-center rounded-full border text-sm shadow-xs">
                            <Link
                                href={item.href}
                                onClick={() => add({ ...item, at: Date.now() })}
                                className="hover:text-primary flex min-w-0 items-center gap-1.5 py-1 pr-1 pl-3 font-medium"
                            >
                                {item.platform ? (
                                    <PlatformIcon platform={item.platform} className="size-3.5" />
                                ) : (
                                    <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                                )}
                                <span className="max-w-56 truncate">{item.text}</span>
                            </Link>
                            <button
                                type="button"
                                onClick={() => remove(item.href)}
                                className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-full"
                                aria-label={`Remove ${item.text} from recent searches`}
                            >
                                <XIcon className="size-3.5" />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
