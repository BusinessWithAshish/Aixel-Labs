'use client';

import Link from 'next/link';
import { AlertTriangleIcon, CheckIcon, KeyRoundIcon, Loader2Icon, XIcon } from 'lucide-react';
import { CONTENT_LAB_LIMITS } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_CHECK_RESPONSE, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_LANGUAGES } from '../../../_constants';
import { creatorLabel, timesUsual } from '../../_utils/format';
import { postBreakdownHref } from '../../_utils/smart-box';
import type { UseCheckPageReturn } from '../_hooks/use-check-page';

const SETTINGS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS];
const WINNERS_SHOWN = 5;

const DRAFT_KIND: Record<ContentLabPlatform, string> = { youtube: 'YouTube title', instagram: 'Reel hook' };

function scoreTone(score: number) {
    if (score >= 70) return { className: 'text-green-600 dark:text-green-400', verdict: 'Likely to beat your usual views.' };
    if (score >= 45) return { className: 'text-amber-600 dark:text-amber-400', verdict: 'Close. Fix the red items first.' };
    return { className: 'text-destructive', verdict: 'Likely below your usual views. Fix the red items.' };
}

function CheckForm() {
    const { platform, setPlatform, query, setQuery, text, setText, language, setLanguage, check, canSubmit, submit } =
        usePage<UseCheckPageReturn>();
    return (
        <form onSubmit={submit} className="bg-card flex flex-col gap-3 rounded-xl border p-4">
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Select value={platform} onValueChange={(value) => setPlatform(value as ContentLabPlatform)}>
                    <SelectTrigger aria-label="Platform" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(DRAFT_KIND) as ContentLabPlatform[]).map((p) => (
                            <SelectItem key={p} value={p}>
                                {DRAFT_KIND[p]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Topic or niche"
                    placeholder="Your niche, e.g. protein breakfast"
                    maxLength={CONTENT_LAB_LIMITS.maxQueryChars}
                    required
                />
            </div>
            <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label="Your idea"
                placeholder="Your title, hook or caption, e.g. My protein breakfast routine"
                maxLength={CONTENT_LAB_LIMITS.maxCheckTextChars}
                rows={2}
                required
                className="text-base"
            />
            <div className="flex flex-wrap items-center gap-2">
                <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger aria-label="Language for stronger versions" className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CONTENT_LAB_LANGUAGES.map((l) => (
                            <SelectItem key={l} value={l}>
                                {l}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="submit" disabled={!canSubmit} className="ml-auto">
                    {check.status === 'loading' ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Check it
                </Button>
            </div>
        </form>
    );
}

function Score({ result }: { result: CONTENT_LAB_CHECK_RESPONSE }) {
    const tone = scoreTone(result.score);
    const passed = result.checks.filter((c) => c.passed);
    const failed = result.checks.filter((c) => !c.passed);
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Card className="h-auto">
                <CardHeader>
                    <CardTitle>Score vs niche winners</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                    <p className={cn('text-6xl font-bold tracking-tight tabular-nums', tone.className)} data-testid="content-lab-check-score">
                        {Math.round(result.score)}
                        <span className="text-muted-foreground text-2xl font-medium">/100</span>
                    </p>
                    <p className="text-muted-foreground text-sm">{tone.verdict}</p>
                </CardContent>
            </Card>
            <Card className="h-auto">
                <CardHeader>
                    <CardTitle>What it has, and what it misses</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="flex flex-col gap-3">
                        {[...passed, ...failed].map((item) => (
                            <li key={item.label} className="flex gap-3" data-passed={item.passed}>
                                <span
                                    aria-label={item.passed ? 'Passed' : 'Missing'}
                                    className={cn(
                                        'flex size-6 shrink-0 items-center justify-center rounded-full',
                                        item.passed ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-destructive/15 text-destructive',
                                    )}
                                >
                                    {item.passed ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold break-words">{item.label}</p>
                                    <p className="text-muted-foreground text-sm break-words">{item.detail}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

function Rewrites() {
    const { rewrites, applyVersion } = usePage<UseCheckPageReturn>();
    if (rewrites.status === 'idle') return null;
    return (
        <Card className="h-auto">
            <CardHeader>
                <CardTitle>3 stronger versions</CardTitle>
            </CardHeader>
            <CardContent>
                {rewrites.status === 'loading' ? (
                    <div aria-busy="true" className="flex flex-col gap-2">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-12" />
                        ))}
                    </div>
                ) : rewrites.status === 'no-key' ? (
                    <div className="flex flex-col items-start gap-2 text-sm">
                        <p className="flex items-center gap-2 font-medium">
                            <KeyRoundIcon className="size-4" /> Add your Gemini key to get 3 stronger versions
                        </p>
                        <p className="text-muted-foreground">They are written on your own key (the free tier works).</p>
                        <Button asChild size="sm" variant="outline">
                            <Link href={SETTINGS_URL}>Open Content Lab settings</Link>
                        </Button>
                    </div>
                ) : rewrites.status === 'error' ? (
                    <Alert variant="destructive">
                        <AlertTriangleIcon className="size-4" />
                        <AlertTitle>No stronger versions this time</AlertTitle>
                        <AlertDescription className="flex flex-col items-start gap-2">
                            {rewrites.error}
                            <Link href={SETTINGS_URL} className="text-foreground underline underline-offset-2">
                                Content Lab settings
                            </Link>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {rewrites.versions.map((version) => (
                            <li key={version} className="flex items-center gap-3 rounded-lg border p-3">
                                <span className="min-w-0 flex-1 break-words">{version}</span>
                                <Button size="sm" variant="secondary" onClick={() => applyVersion(version)} aria-label={`Use: ${version}`}>
                                    Use
                                </Button>
                            </li>
                        ))}
                    </ol>
                )}
            </CardContent>
        </Card>
    );
}

function Winners({ result }: { result: CONTENT_LAB_CHECK_RESPONSE }) {
    if (!result.winners.length) return null;
    return (
        <Card className="h-auto">
            <CardHeader>
                <CardTitle>Compared with</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="flex flex-col gap-3 text-sm">
                    {result.winners.slice(0, WINNERS_SHOWN).map((post) => (
                        <li key={post.id} className="min-w-0">
                            <Link href={postBreakdownHref(post)} className="line-clamp-2 font-medium break-words hover:underline">
                                {post.title}
                            </Link>
                            <p className="text-muted-foreground">
                                {creatorLabel(post.creator)}
                                {post.multiple != null ? ` · ${timesUsual(post.multiple)}` : ''}
                            </p>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}

/** Check my idea: the form, then score + checks, 3 stronger versions and the winners compared with. */
export function CheckView() {
    const { check } = usePage<UseCheckPageReturn>();
    return (
        <div className="flex w-full flex-col gap-6 p-1 sm:p-2">
            <header className="flex flex-col gap-1">
                <p className="text-primary text-xs font-medium tracking-wider uppercase">3 · Check</p>
                <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">Check my idea before I post</h1>
                <p className="text-muted-foreground">
                    Paste your title, hook or caption. We compare it with what is winning in your niche right now.
                </p>
            </header>
            <CheckForm />
            {check.status === 'loading' ? (
                <div aria-busy="true" className="grid gap-4 lg:grid-cols-[1fr_2fr]">
                    <Skeleton className="h-40" />
                    <Skeleton className="h-40" />
                </div>
            ) : check.status === 'error' ? (
                <Alert variant="destructive">
                    <AlertTriangleIcon className="size-4" />
                    <AlertTitle>Could not check this idea</AlertTitle>
                    <AlertDescription>{check.error}</AlertDescription>
                </Alert>
            ) : check.status === 'done' ? (
                <>
                    <Score result={check.result} />
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <Rewrites />
                        <Winners result={check.result} />
                    </div>
                </>
            ) : null}
        </div>
    );
}
