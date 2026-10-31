import Link from 'next/link';
import { ArrowRight, CheckIcon, ClipboardCheck, Sparkles } from 'lucide-react';
import PageLayout from '@/components/common/PageLayout';
import { CONTENT_LAB_CHECK_ROUTE } from '@/config/app-config';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_SOURCES, CONTENT_LAB_VS_STUDIO } from '../_constants';
import { PlatformIcon } from '../_components/PlatformIcon';
import { RecentSearches } from './_components/RecentSearches';
import { SmartBox } from './_components/SmartBox';

/** The other way in: an idea already written, scored before it is posted. Beside the heading, not under the search. */
function CheckIdeaLink({ className }: { className?: string }) {
    return (
        <Link
            href={CONTENT_LAB_CHECK_ROUTE}
            className={cn('group bg-card hover:border-foreground/40 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xs transition-colors', className)}
        >
            <ClipboardCheck className="text-primary size-5 shrink-0" aria-hidden />
            <span className="min-w-0">
                <span className="text-muted-foreground block text-xs">Have an idea already?</span>
                <span className="block text-sm font-semibold">Check it before you post</span>
            </span>
            <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
    );
}

/**
 * Why this and not YouTube Studio / Instagram Insights, as a side-by-side: their column dim, ours lit.
 * Drawn in the inverse colours so it reads as its own thing, not one more card.
 */
function VsStudio() {
    return (
        <section aria-labelledby="vs-studio" className="bg-foreground text-background flex flex-col gap-6 rounded-2xl p-5 sm:p-8">
            <div className="flex max-w-2xl flex-col gap-2">
                <h2 id="vs-studio" className="text-xl font-bold tracking-tight text-balance sm:text-2xl">
                    What you get here that Studio and Insights don&apos;t show
                </h2>
                <p className="text-background/70">
                    Keep YouTube Studio and Instagram Insights for your own numbers. Come here before you make the next post.
                </p>
            </div>
            {/* Phones: one row per point, ours first. */}
            <ul className="flex flex-col gap-2 sm:hidden">
                {CONTENT_LAB_VS_STUDIO.map((row) => (
                    <li key={row.label} className="bg-background/10 flex flex-col gap-1 rounded-xl p-3">
                        <p className="text-background/60 text-xs font-medium tracking-wide uppercase">{row.label}</p>
                        <p className="flex items-start gap-2 text-sm font-medium">
                            <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-400 dark:text-emerald-600" aria-hidden />
                            {row.lab}
                        </p>
                        <p className="text-background/60 pl-6 text-sm">Studio &amp; Insights: {row.studio}</p>
                    </li>
                ))}
            </ul>
            <div className="hidden grid-cols-[minmax(8rem,auto)_minmax(0,1fr)_minmax(0,1.4fr)] sm:grid">
                <span />
                <p className="text-background/60 flex items-center gap-2 px-4 py-3 text-sm font-medium">
                    <span className="flex items-center gap-1">
                        {CONTENT_LAB_SOURCES.map((source) => (
                            <PlatformIcon key={source.platform} platform={source.platform} className="size-4 opacity-70" />
                        ))}
                    </span>
                    Studio &amp; Insights
                </p>
                <p className="bg-background/10 flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold">
                    <Sparkles className="size-4" aria-hidden /> Content Lab
                </p>
                {CONTENT_LAB_VS_STUDIO.map((row, index) => {
                    const last = index === CONTENT_LAB_VS_STUDIO.length - 1;
                    return (
                        <div key={row.label} className="contents">
                            <p className="text-background/60 border-t border-current/15 py-4 pr-4 text-xs font-medium tracking-wide uppercase">
                                {row.label}
                            </p>
                            <p className="text-background/60 border-t border-current/15 px-4 py-4 text-sm">{row.studio}</p>
                            <p
                                className={cn(
                                    'bg-background/10 flex items-start gap-2 border-t border-current/15 px-4 py-4 text-sm font-medium',
                                    last && 'rounded-b-xl',
                                )}
                            >
                                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-400 dark:text-emerald-600" aria-hidden />
                                {row.lab}
                            </p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

/** Content Lab home: one search bar for any topic, niche, link or @creator on the sources picked, then what it gives you. */
export default function ContentLabSearchPage() {
    return (
        <PageLayout title="Content Lab">
            <div className="flex w-full flex-col gap-10 p-1 sm:p-2">
                <section aria-labelledby="search-title" className="grid gap-x-8 gap-y-5 pt-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-6">
                    <div className="flex max-w-3xl min-w-0 flex-col gap-2">
                        <h1 id="search-title" className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
                            Find what&apos;s already working. Then make your version.
                        </h1>
                        <p className="text-muted-foreground text-balance sm:text-lg">
                            Search any topic, niche, creator or link, on one source or several. You get the posts that did far better than
                            their creator&apos;s usual, and why.
                        </p>
                    </div>
                    <CheckIdeaLink className="max-lg:order-last lg:self-end" />
                    <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                        <SmartBox />
                        <RecentSearches />
                    </div>
                </section>

                <VsStudio />
            </div>
        </PageLayout>
    );
}
