import Link from 'next/link';
import { ArrowRight, AtSign, BarChart3, ClipboardCheck, Hash, Link2, Play, Sparkles } from 'lucide-react';
import PageLayout from '@/components/common/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CONTENT_LAB_CHECK_ROUTE } from '@/config/app-config';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_HOME_EXAMPLE, CONTENT_LAB_QUERY_KINDS, CONTENT_LAB_VS_STUDIO } from '../_constants';
import { PlatformIcon, PlatformPill } from '../_components/PlatformIcon';
import { SmartBox } from './_components/SmartBox';
import { exploreHref } from './_utils/smart-box';

const QUERY_KIND_ICON = { topic: Hash, link: Link2, creator: AtSign } as const;

/** What the box takes: three tiles, each saying what it gives back. */
function QueryKinds() {
    return (
        <section aria-labelledby="query-kinds" className="flex flex-col gap-3">
            <h2 id="query-kinds" className="text-sm font-semibold">
                What can I type?
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
                {CONTENT_LAB_QUERY_KINDS.map((item) => {
                    const Icon = QUERY_KIND_ICON[item.kind];
                    return (
                        <Card key={item.kind} className="gap-2 px-4 py-4">
                            <div className="flex items-center gap-2">
                                <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                                    <Icon className="size-4" />
                                </span>
                                <h3 className="font-semibold">{item.title}</h3>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {item.examples.map((example) =>
                                    item.kind === 'topic' ? (
                                        <Link
                                            key={example}
                                            href={exploreHref({ q: example })}
                                            className="bg-muted hover:bg-primary/10 hover:text-primary rounded-md px-2 py-0.5 text-xs font-medium"
                                        >
                                            {example}
                                        </Link>
                                    ) : (
                                        <code key={example} className="bg-muted rounded-md px-2 py-0.5 text-xs">
                                            {example}
                                        </code>
                                    ),
                                )}
                            </div>
                            <p className="text-muted-foreground text-sm">{item.gives}</p>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}

/** The "why not YouTube Studio?" answer, small enough for a side column. */
function VsStudio() {
    return (
        <Card className="gap-3 px-4 py-4" aria-labelledby="vs-studio">
            <h2 id="vs-studio" className="text-sm font-semibold">
                Already have YouTube Studio and Instagram insights?
            </h2>
            <p className="text-muted-foreground text-sm">Keep them. They answer a different question.</p>
            <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 text-sm">
                <span />
                <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                    <BarChart3 className="size-3.5" /> Studio
                </span>
                <span className="text-primary flex items-center gap-1 text-xs font-medium">
                    <Sparkles className="size-3.5" /> Content Lab
                </span>
                {CONTENT_LAB_VS_STUDIO.map((row) => (
                    <div key={row.label} className="contents">
                        <dt className="text-muted-foreground text-xs">{row.label}</dt>
                        <dd className="text-muted-foreground">{row.studio}</dd>
                        <dd className="font-medium">{row.lab}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

/** A thumbnail stand-in for the example: the platform's shape, a play mark and the multiple. */
function ExampleThumb({ platform, multiple, className }: { platform: 'youtube' | 'instagram'; multiple: string; className?: string }) {
    return (
        <div
            className={cn(
                'relative grid place-items-center overflow-hidden rounded-lg bg-gradient-to-br',
                platform === 'youtube' ? 'aspect-video from-red-500/80 to-orange-400/70' : 'aspect-[9/16] from-fuchsia-500/80 to-amber-400/70',
                className,
            )}
        >
            <Play className="size-6 fill-white text-white" />
            <span className="bg-background/90 absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-xs font-bold">{multiple}</span>
        </div>
    );
}

/** One topic searched, a winner on each platform, the pattern they share, and that hook written per platform. */
function WorkedExample() {
    const example = CONTENT_LAB_HOME_EXAMPLE;
    return (
        <section aria-labelledby="worked-example" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <h2 id="worked-example" className="text-lg font-semibold">
                    One search, every platform
                </h2>
                <Badge variant="outline">Example</Badge>
            </div>
            <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,0.9fr)_auto_minmax(0,1.2fr)]">
                <Card className="gap-3 px-4 py-4">
                    <p className="text-muted-foreground text-xs font-medium uppercase">1 · You search</p>
                    <p className="bg-muted flex w-fit max-w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium">
                        <Hash className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate">
                            {example.query} · {example.country}
                        </span>
                    </p>
                    <div className="flex items-end gap-3">
                        <div className="flex min-w-0 flex-[2] flex-col gap-1">
                            <ExampleThumb platform="youtube" multiple={example.youtube.multiple} />
                            <p className="flex items-center gap-1 text-xs font-medium">
                                <PlatformIcon platform="youtube" className="size-3.5" /> {example.youtube.creator}
                            </p>
                            <p className="line-clamp-2 text-xs">{example.youtube.title}</p>
                        </div>
                        <div className="flex w-20 shrink-0 flex-col gap-1">
                            <ExampleThumb platform="instagram" multiple={example.instagram.multiple} />
                            <p className="flex items-center gap-1 text-xs font-medium">
                                <PlatformIcon platform="instagram" className="size-3.5" /> Reel
                            </p>
                        </div>
                    </div>
                </Card>
                <ArrowRight className="text-muted-foreground hidden size-5 self-center lg:block" aria-hidden />
                <Card className="gap-2 px-4 py-4">
                    <p className="text-muted-foreground text-xs font-medium uppercase">2 · The pattern both share</p>
                    <p className="text-primary text-lg leading-snug font-bold">{example.pattern}</p>
                    <p className="text-sm">
                        <q>{example.youtube.title}</q> and <q>{example.instagram.title}</q>
                    </p>
                    <p className="text-muted-foreground mt-auto text-xs">{example.evidence}</p>
                </Card>
                <ArrowRight className="text-muted-foreground hidden size-5 self-center lg:block" aria-hidden />
                <Card className="gap-2 px-4 py-4">
                    <p className="text-muted-foreground text-xs font-medium uppercase">3 · Your hook, per platform</p>
                    <ul className="flex flex-col gap-2">
                        {example.hooks.map((hook) => (
                            <li key={hook.platform} className="flex items-start gap-2 text-sm">
                                <PlatformIcon platform={hook.platform} className="mt-0.5" />
                                <span className="min-w-0">
                                    <span className="text-muted-foreground block text-xs">{hook.label}</span>
                                    <span className="block">{hook.text}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-muted-foreground mt-auto text-xs">Boards write these for you, in your own voice.</p>
                </Card>
            </div>
        </section>
    );
}

/** Content Lab home: one box that takes a topic, a link or an @creator, what each gives back, and a worked example. */
export default function ContentLabSearchPage() {
    return (
        <PageLayout title="Content Lab">
            <div className="flex w-full flex-col gap-8 p-1 sm:p-2">
                <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="flex min-w-0 flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-medium">Searches</span>
                            <PlatformPill platform="youtube" />
                            <PlatformPill platform="instagram" />
                            <span className="text-muted-foreground ml-1 font-medium">Writes for</span>
                            <PlatformPill platform="linkedin" muted />
                            <PlatformPill platform="x" muted />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                            Find what&apos;s already working. Then make your version.
                        </h1>
                        <p className="text-muted-foreground max-w-prose">
                            Type what your audience would search. You get the posts that did far better than their creator&apos;s usual, on
                            YouTube and Instagram at once, and the reason in plain words.
                        </p>
                        <SmartBox />
                    </div>
                    <aside className="xl:pt-10">
                        <VsStudio />
                    </aside>
                </section>

                <QueryKinds />

                <WorkedExample />

                <Link
                    href={CONTENT_LAB_CHECK_ROUTE}
                    className="group bg-muted/40 hover:border-foreground flex items-center gap-3 rounded-xl border p-4 transition-colors"
                >
                    <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                        <ClipboardCheck className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Already have an idea? Check it before you post</span>
                        <span className="text-muted-foreground block text-sm">
                            Score your title or hook against what won in your niche, and get 3 stronger versions.
                        </span>
                    </span>
                    <ArrowRight className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
            </div>
        </PageLayout>
    );
}
