'use client';

import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command as CommandPrimitive } from 'cmdk';
import { AtSign, BadgeCheck, ClockIcon, CornerDownLeft, Hash, Link2, Loader2, SearchIcon, XIcon } from 'lucide-react';
import { CONTENT_LAB_DEFAULT_COUNTRY, CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_HASHTAG, CONTENT_LAB_KEYWORD_RESPONSE, CONTENT_LAB_SUGGESTION } from '@aixellabs/backend/content-lab/types';
import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CONTENT_LAB_EXPLORE_ROUTE } from '@/config/app-config';
import { cn } from '@/lib/utils';
import {
    CONTENT_LAB_PLATFORM_LABELS,
    CONTENT_LAB_SMART_BOX_EXAMPLES,
    CONTENT_LAB_SMART_BOX_HINTS,
    type ContentLabPlatformFilter,
} from '../../_constants';
import { CreatorAvatar } from '../../_components/CreatorAvatar';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { useCreatorSuggest } from '../../_hooks/use-creator-suggest';
import { useKeyword } from '../_hooks/use-keyword';
import { useRecentSearches, useSearchPlatform } from '../_hooks/use-recent-searches';
import { compactNumber } from '../_utils/format';
import { detectQuery, exploreHref, platformsOf, recentSearchOf, type RecentSearch, smartQueryHref } from '../_utils/smart-box';
import { PlatformScores, PlatformScoresSkeleton, ScoreRing } from './KeywordScore';
import { SourcePicker } from './SourcePicker';

type SmartBoxProps = {
    defaultValue?: string;
    /** `lg` on Search home, `default` above results. */
    size?: 'lg' | 'default';
    /** Sources a search runs on, picked at the start of the bar. Without it (Search home) the choice is remembered on this device. */
    platform?: ContentLabPlatformFilter;
    onPlatformChange?: (platform: ContentLabPlatformFilter) => void;
    country?: string;
    className?: string;
};

const RECENT_ICON = { topic: Hash, creator: AtSign, link: Link2 } as const;
/** Rows per group, so the list stays one glance long. */
const MAX_RECENT = 5;
const MAX_SEARCHES = 4;
const MAX_HASHTAGS = 4;
const MAX_CREATORS = 4;
/** Typed as a topic, accounts smaller than this are noise ("protein" finds a 7-follower @protein). */
const MIN_TOPIC_CREATOR_FOLLOWERS = 1_000;

const bareHandle = (creator: CONTENT_LAB_SUGGESTION) => creator.handle.replace(/^@+/, '');

/** An example as shown on its chip: links without their https://. */
const exampleText = (value: string) => value.replace(/^https?:\/\//, '');

/**
 * One bar for a topic, a niche, a YouTube/Instagram link or an @creator, with the sources to search at its start.
 * As you type, a list drops down with what it understood: for a topic, how strong it is on each source picked (a ring
 * and a row per platform), what people also search on YouTube, the hashtags used on Instagram and accounts of a real
 * size named like it; for an @handle, matching creators; for a link, its preview. With nothing typed, your recent
 * searches. Changing the sources updates the list. Arrow keys move,
 * Enter opens, Escape closes. A plain GET form underneath, so it works before hydration (the explore page re-routes
 * links and creators).
 */
export function SmartBox({ defaultValue = '', size = 'lg', platform: platformProp, onPlatformChange, country = CONTENT_LAB_DEFAULT_COUNTRY, className }: SmartBoxProps) {
    const router = useRouter();
    const hintId = useId();
    const anchor = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState(defaultValue);
    const [focused, setFocused] = useState(false);
    // Nothing is looked up until the box is first used (the results page fills it with the search already run).
    const [engaged, setEngaged] = useState(false);
    const [storedPlatform, setStoredPlatform] = useSearchPlatform();
    const platform = platformProp ?? storedPlatform;
    const setPlatform = onPlatformChange ?? setStoredPlatform;
    const { recent, add, remove, clear } = useRecentSearches();

    const detected = detectQuery(value);
    const href = detected ? smartQueryHref(detected, platform) : null;
    const topic = engaged && detected?.kind === 'topic' ? detected.query : null;
    // Creators: a name typed as a topic (one or two words) or an @handle.
    const creatorText = !engaged ? '' : detected?.kind === 'creator' ? detected.handle : topic && topic.split(/\s+/).length <= 2 ? topic : '';
    const onlyPlatform = detected?.kind === 'creator' && detected.platform ? detected.platform : platform;
    const youtube = useCreatorSuggest('youtube', onlyPlatform !== 'instagram' ? creatorText : '', country);
    const instagram = useCreatorSuggest('instagram', onlyPlatform !== 'youtube' ? creatorText : '', country);
    const sources = platformsOf(platform);
    // The quick answer (~0.5 s) fills the list; the one with YouTube's 12-month trend (~1 s) then sharpens the score.
    const quick = useKeyword(topic, country, { trend: false, delayMs: 150, platforms: sources });
    const full = useKeyword(topic, country, { trend: true, delayMs: 600, platforms: sources });
    const keyword = full.data ?? quick.data;

    const typed = value.trim().toLowerCase();
    const recentRows = (typed ? recent.filter((item) => item.text.toLowerCase().includes(typed) && item.href !== href) : recent).slice(
        0,
        typed ? 3 : MAX_RECENT,
    );
    const searchRows = (keyword?.searches ?? []).slice(0, MAX_SEARCHES);
    const ownTag = typed.replace(/[^\p{L}\p{N}_]/gu, '');
    const hashtagRows = (keyword?.hashtags ?? []).filter((tag) => tag.name !== ownTag).slice(0, MAX_HASHTAGS);
    // A name typed as a topic: real accounts only, biggest first. An @handle: everything that matches.
    const creatorRows = [...youtube.creators.slice(0, 4), ...instagram.creators.slice(0, 3)]
        .filter((c) => detected?.kind === 'creator' || c.followers == null || c.followers >= MIN_TOPIC_CREATOR_FOLLOWERS)
        .sort((a, b) => (detected?.kind === 'creator' ? 0 : (b.followers ?? 0) - (a.followers ?? 0)))
        .slice(0, MAX_CREATORS);
    const creatorsLoading = youtube.loading || instagram.loading;

    // The highlighted row: the first one whenever the list changes, then wherever the arrow keys move it.
    const values = [
        ...(href ? ['primary'] : []),
        ...recentRows.map((item) => `recent:${item.href}`),
        ...searchRows.map((text) => `search:${text}`),
        ...hashtagRows.map((tag) => `tag:${tag.name}`),
        ...creatorRows.map((c) => `creator:${c.platform}:${bareHandle(c)}`),
    ];
    const listKey = values.join('|');
    // A link it cannot use says so under the box, so the list stays shut.
    const open = focused && (values.length > 0 || (detected?.kind === 'creator' && creatorsLoading));
    const [highlight, setHighlight] = useState({ listKey: '', value: '' });
    const active = highlight.listKey === listKey ? highlight.value : (values[0] ?? '');

    const go = (target: string, entry: RecentSearch | null) => {
        add(entry);
        setFocused(false);
        router.push(target);
    };
    const goTyped = () => {
        if (detected && href) go(href, recentSearchOf(detected, platform));
    };
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        goTyped();
    };
    const pickSearch = (text: string) => {
        const query = { kind: 'topic', query: text } as const;
        go(smartQueryHref(query, platform)!, recentSearchOf(query, platform));
    };
    const pickHashtag = (tag: CONTENT_LAB_HASHTAG) => {
        const query = { kind: 'topic', query: `#${tag.name}` } as const;
        go(smartQueryHref(query, 'instagram')!, recentSearchOf(query, 'instagram'));
    };
    const pickCreator = (creator: CONTENT_LAB_SUGGESTION) => {
        const handle = bareHandle(creator);
        go(exploreHref({ creator: handle, platform: creator.platform }), {
            kind: 'creator',
            text: `@${handle}`,
            href: exploreHref({ creator: handle, platform: creator.platform }),
            platform: creator.platform,
            at: Date.now(),
        });
    };

    return (
        <form action={CONTENT_LAB_EXPLORE_ROUTE} onSubmit={submit} className={cn('flex min-w-0 flex-col gap-2', className)}>
            {platform !== 'both' ? <input type="hidden" name="platform" value={platform} /> : null}
            <Command
                shouldFilter={false}
                loop
                value={active}
                onValueChange={(next) => setHighlight({ listKey, value: next })}
                className="h-auto overflow-visible bg-transparent"
            >
                <Popover open={open} onOpenChange={(next) => !next && setFocused(false)}>
                    <div className="flex gap-2">
                        <PopoverAnchor asChild>
                            <div
                                ref={anchor}
                                className={cn(
                                    'border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 bg-background flex min-w-0 flex-1 items-center rounded-lg border shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]',
                                    size === 'lg' ? 'h-12 shadow-sm' : 'h-10',
                                )}
                            >
                                <SourcePicker value={platform} onValueChange={setPlatform} />
                                <span className="bg-border h-6 w-px shrink-0" aria-hidden />
                                <SearchIcon className="text-muted-foreground mr-2 ml-3 size-4 shrink-0" aria-hidden />
                                <CommandPrimitive.Input
                                    ref={input}
                                    name="q"
                                    value={value}
                                    onValueChange={setValue}
                                    onFocus={() => {
                                        setFocused(true);
                                        setEngaged(true);
                                    }}
                                    onBlur={() => setFocused(false)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') setFocused(false);
                                        else if (event.key === 'Enter' && (!open || !values.length)) {
                                            // Nothing listed to pick: Enter does what Go does.
                                            event.preventDefault();
                                            goTyped();
                                        } else if (!focused) setFocused(true);
                                    }}
                                    required
                                    autoComplete="off"
                                    maxLength={500}
                                    aria-label="Topic, link or @creator"
                                    aria-describedby={hintId}
                                    placeholder="Search any topic, creator or link"
                                    className={cn(
                                        'placeholder:text-muted-foreground w-0 min-w-0 flex-1 bg-transparent pr-3 outline-hidden',
                                        size === 'lg' ? 'text-base' : 'text-base md:text-sm',
                                    )}
                                />
                                {value ? (
                                    <button
                                        type="button"
                                        onClick={() => setValue('')}
                                        onMouseDown={(event) => event.preventDefault()}
                                        className="text-muted-foreground hover:text-foreground mr-3 shrink-0"
                                        aria-label="Clear"
                                    >
                                        <XIcon className="size-4" />
                                    </button>
                                ) : null}
                            </div>
                        </PopoverAnchor>
                        <Button
                            type="submit"
                            size={size === 'lg' ? 'lg' : 'default'}
                            className={cn(size === 'lg' ? 'h-12 px-5' : 'h-10')}
                            disabled={!!detected && !href}
                        >
                            <SearchIcon /> Go
                        </Button>
                    </div>
                    <PopoverContent
                        align="start"
                        sideOffset={6}
                        className="w-(--radix-popover-trigger-width) min-w-[min(20rem,calc(100vw-2rem))] p-0"
                        onOpenAutoFocus={(event) => event.preventDefault()}
                        onInteractOutside={(event) => {
                            if (anchor.current?.contains(event.target as Node)) event.preventDefault();
                        }}
                        // Keeps the input focused while a row is clicked.
                        onMouseDown={(event) => event.preventDefault()}
                        data-testid="smart-box-list"
                    >
                        <CommandList aria-label="Suggestions" className="max-h-[min(28rem,60dvh)]">
                            {detected && href ? (
                                <CommandGroup>
                                    <CommandItem value="primary" onSelect={goTyped} className="items-start gap-3 py-2.5">
                                        <PrimaryRow query={detected} platform={platform} keyword={keyword} />
                                    </CommandItem>
                                </CommandGroup>
                            ) : null}
                            {recentRows.length ? (
                                <CommandGroup
                                    heading={
                                        <span className="flex items-center justify-between gap-2">
                                            Recent searches
                                            {!typed ? (
                                                <button
                                                    type="button"
                                                    className="hover:text-foreground font-medium"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        clear();
                                                    }}
                                                >
                                                    Clear
                                                </button>
                                            ) : null}
                                        </span>
                                    }
                                >
                                    {recentRows.map((item) => {
                                        const Icon = RECENT_ICON[item.kind];
                                        return (
                                            <CommandItem
                                                key={item.href}
                                                value={`recent:${item.href}`}
                                                onSelect={() => go(item.href, { ...item, at: Date.now() })}
                                                className="group/recent gap-3"
                                                data-testid="recent-search"
                                            >
                                                <ClockIcon className="size-4" aria-hidden />
                                                <span className="min-w-0 flex-1 truncate">{item.text}</span>
                                                {item.platform ? <PlatformIcon platform={item.platform} className="size-4" /> : <Icon className="size-3.5 opacity-60" aria-hidden />}
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground hover:text-foreground rounded p-0.5 sm:opacity-0 sm:group-hover/recent:opacity-100 sm:group-data-[selected=true]/recent:opacity-100"
                                                    aria-label={`Remove ${item.text} from recent searches`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        remove(item.href);
                                                    }}
                                                >
                                                    <XIcon className="size-3.5" />
                                                </button>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            ) : null}
                            {searchRows.length ? (
                                <CommandGroup heading={<GroupHeading platform="youtube">People also search on YouTube</GroupHeading>}>
                                    {searchRows.map((text) => (
                                        <CommandItem key={text} value={`search:${text}`} onSelect={() => pickSearch(text)} className="gap-3">
                                            <SearchIcon className="size-4" aria-hidden />
                                            <span className="min-w-0 flex-1 truncate">{text}</span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}
                            {hashtagRows.length ? (
                                <CommandGroup heading={<GroupHeading platform="instagram">Hashtags on Instagram</GroupHeading>}>
                                    {hashtagRows.map((tag) => (
                                        <CommandItem key={tag.name} value={`tag:${tag.name}`} onSelect={() => pickHashtag(tag)} className="gap-3" data-testid="smart-box-hashtag">
                                            <Hash className="size-4" aria-hidden />
                                            <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                                            {tag.posts != null ? (
                                                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{compactNumber(tag.posts)} posts</span>
                                            ) : null}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}
                            {creatorRows.length ? (
                                <CommandGroup heading={detected?.kind === 'creator' ? 'Creators' : 'Accounts named like this'}>
                                    {creatorRows.map((creator) => (
                                        <CreatorRow key={`${creator.platform}:${creator.handle}`} creator={creator} onPick={pickCreator} />
                                    ))}
                                </CommandGroup>
                            ) : creatorsLoading && detected?.kind === 'creator' ? (
                                <p className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm" role="status">
                                    <Loader2 className="size-4 animate-spin" /> Looking for creators…
                                </p>
                            ) : null}
                        </CommandList>
                    </PopoverContent>
                </Popover>
            </Command>
            {size === 'lg' && !detected ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground mr-1 text-sm">Try</span>
                    {CONTENT_LAB_SMART_BOX_EXAMPLES.map((example) => {
                        const Icon = RECENT_ICON[example.kind];
                        return (
                            <button
                                key={example.value}
                                type="button"
                                onClick={() => {
                                    setValue(example.value);
                                    input.current?.focus();
                                }}
                                className="bg-muted hover:bg-primary/10 hover:text-primary inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors"
                            >
                                <Icon className="size-3.5 shrink-0 opacity-60" aria-hidden />
                                <span className="truncate">{exampleText(example.value)}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <p id={hintId} aria-live="polite" className="text-muted-foreground text-sm empty:hidden">
                {detected?.kind === 'unsupported' ? (
                    <span className="text-destructive">{CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL}</span>
                ) : detected && size === 'lg' ? (
                    <>
                        Looks like a <b className="text-foreground">{detected.kind}</b> → {CONTENT_LAB_SMART_BOX_HINTS[detected.kind]}
                    </>
                ) : null}
            </p>
        </form>
    );
}

type PrimaryRowProps = {
    query: NonNullable<ReturnType<typeof detectQuery>>;
    platform: ContentLabPlatformFilter;
    keyword: CONTENT_LAB_KEYWORD_RESPONSE | null;
};

const onWhere = (platform: ContentLabPlatformFilter) => (platform === 'both' ? 'YouTube and Instagram' : CONTENT_LAB_PLATFORM_LABELS[platform]);

/** A group's heading with the logo of the platform its rows come from. */
function GroupHeading({ platform, children }: { platform: 'youtube' | 'instagram'; children: ReactNode }) {
    return (
        <span className="flex items-center gap-1.5">
            <PlatformIcon platform={platform} className="size-3.5" />
            {children}
        </span>
    );
}

/** What the box took the text for, so it is clear before Enter what will run. */
function KindChip({ children }: { children: ReactNode }) {
    return (
        <span className="text-muted-foreground border-border shrink-0 rounded border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
            {children}
        </span>
    );
}

/** "↵" at the end of the first row: Enter runs it. */
function EnterHint() {
    return (
        <span className="text-muted-foreground hidden shrink-0 items-center gap-1 self-center text-xs sm:flex" aria-hidden>
            <CornerDownLeft className="size-3.5" />
        </span>
    );
}

/**
 * The first row: what Enter / Go will do with what was typed. A topic gets how strong it is on each source picked
 * (the ring, then a row per platform with the sentence behind it); a link its preview; an @handle where it looks.
 */
function PrimaryRow({ query, platform, keyword }: PrimaryRowProps) {
    if (query.kind === 'link') {
        return (
            <>
                <span className="bg-muted relative grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded-md">
                    {query.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={query.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                    ) : (
                        <PlatformIcon platform={query.platform} className="size-6" />
                    )}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">Break down this {query.label.replace(/^(YouTube|Instagram) /, '')}</span>
                        <KindChip>Link</KindChip>
                    </span>
                    <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                        <PlatformIcon platform={query.platform} className="size-3.5" />
                        <span className="truncate">{query.label}: hook, structure, CTA and why it worked</span>
                    </span>
                </span>
                <EnterHint />
            </>
        );
    }
    if (query.kind === 'creator') {
        return (
            <>
                <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-full">
                    <AtSign className="text-primary size-4" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">See @{query.handle}&apos;s standout posts</span>
                        <KindChip>Creator</KindChip>
                    </span>
                    <span className="text-muted-foreground text-xs">On {onWhere(query.platform ?? platform)}: the ones that beat their usual</span>
                </span>
                <EnterHint />
            </>
        );
    }
    if (query.kind !== 'topic') return null;
    const sources = platformsOf(platform);
    return (
        <span className="grid min-w-0 flex-1 gap-2.5" data-testid="smart-box-topic">
            <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-medium">
                    What&apos;s working for &ldquo;{query.query}&rdquo;
                </span>
                <KindChip>{query.query.startsWith('#') ? 'Hashtag' : 'Topic'}</KindChip>
                <span className="ml-auto">
                    <EnterHint />
                </span>
            </span>
            <span className="bg-muted/50 flex min-w-0 items-center gap-3 rounded-lg p-2.5">
                <ScoreRing data={keyword} size={52} />
                <span className="min-w-0 flex-1">
                    {keyword ? <PlatformScores data={keyword} compact /> : <PlatformScoresSkeleton count={sources.length} />}
                </span>
            </span>
        </span>
    );
}

function CreatorRow({ creator, onPick }: { creator: CONTENT_LAB_SUGGESTION; onPick: (creator: CONTENT_LAB_SUGGESTION) => void }) {
    const handle = bareHandle(creator);
    return (
        <CommandItem value={`creator:${creator.platform}:${handle}`} onSelect={() => onPick(creator)} className="gap-3 py-2" data-testid="smart-box-creator">
            <CreatorAvatar name={creator.name} handle={handle} avatarUrl={creator.avatarUrl} platform={creator.platform} className="size-9" />
            <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1 font-medium">
                    <span className="truncate">{creator.name ?? `@${handle}`}</span>
                    {creator.verified ? <BadgeCheck className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-label="Verified" /> : null}
                </span>
                <span className="text-muted-foreground truncate text-xs">@{handle}</span>
            </span>
            {creator.followers != null ? (
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{compactNumber(creator.followers)}</span>
            ) : null}
        </CommandItem>
    );
}
