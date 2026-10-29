'use client';

import { useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { BadgeCheck, Loader2, Plus, Search } from 'lucide-react';
import type { CONTENT_LAB_SUGGESTION, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import { CreatorAvatar } from '../../_components/CreatorAvatar';
import { compactNumber } from '../../search/_utils/format';
import type { UseCreatorSuggestReturn } from '../_hooks/use-creator-suggest';
import type { WatchPick } from '../_hooks/use-watching-page';

type CreatorSearchProps = {
    platform: ContentLabPlatform;
    query: string;
    onQueryChange: (query: string) => void;
    suggest: UseCreatorSuggestReturn;
    onPick: (pick: WatchPick) => void;
    disabled?: boolean;
    className?: string;
};

/**
 * The creator box: as you type a name or handle, matching creators drop down (picture, name, handle,
 * followers, verified). Arrow keys move, Enter picks, Escape closes; the last row always adds exactly what
 * was typed, so a creator the list does not know can still be added.
 */
export function CreatorSearch({ platform, query, onQueryChange, suggest, onPick, disabled, className }: CreatorSearchProps) {
    const [focused, setFocused] = useState(false);
    const anchor = useRef<HTMLDivElement>(null);
    const open = focused && suggest.typed.length > 0;
    const label = CONTENT_LAB_PLATFORM_LABELS[platform];

    // The highlighted row: the first one whenever the list changes, then wherever the arrow keys move it.
    const values = [...suggest.creators.map(rowValue), `typed:${suggest.typed}`];
    const listKey = values.join('|');
    const [highlight, setHighlight] = useState({ listKey: '', value: '' });
    const active = highlight.listKey === listKey ? highlight.value : values[0];

    const pick = (value: WatchPick) => {
        setFocused(false);
        onPick(value);
    };

    return (
        <Command
            shouldFilter={false}
            loop
            value={active}
            onValueChange={(value) => setHighlight({ listKey, value })}
            className={cn('h-auto overflow-visible bg-transparent', className)}
        >
            <Popover open={open} onOpenChange={(next) => !next && setFocused(false)}>
                <PopoverAnchor asChild>
                    <div
                        ref={anchor}
                        className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-9 min-w-0 items-center gap-2 rounded-md border bg-transparent px-3 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]"
                    >
                        <Search className="text-muted-foreground size-4 shrink-0" />
                        <CommandPrimitive.Input
                            value={query}
                            onValueChange={onQueryChange}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') setFocused(false);
                                else if (!focused) setFocused(true);
                            }}
                            disabled={disabled}
                            maxLength={100}
                            aria-label="Creator name or handle"
                            placeholder={`Search ${label} creators or type @handle`}
                            className="placeholder:text-muted-foreground w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                        />
                        {suggest.loading ? <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-label="Looking for creators" /> : null}
                    </div>
                </PopoverAnchor>
                <PopoverContent
                    align="start"
                    className="w-(--radix-popover-trigger-width) min-w-64 p-0"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onInteractOutside={(event) => {
                        if (anchor.current?.contains(event.target as Node)) event.preventDefault();
                    }}
                    // Keeps the input focused while a row is clicked.
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <CommandList aria-label="Matching creators" className="max-h-80">
                        {suggest.creators.length ? (
                            <CommandGroup heading={`${label} creators`}>
                                {suggest.creators.map((creator) => (
                                    <SuggestionRow key={`${creator.platform}:${creator.handle}`} creator={creator} onPick={pick} />
                                ))}
                            </CommandGroup>
                        ) : suggest.loading ? (
                            <p className="text-muted-foreground px-3 py-3 text-sm" role="status">
                                Looking for creators…
                            </p>
                        ) : (
                            <p className="text-muted-foreground px-3 py-3 text-sm">
                                {suggest.error || suggest.typed.length < 2 ? 'Keep typing, or add the handle as typed.' : `No ${label} creators match that.`}
                            </p>
                        )}
                        <CommandGroup>
                            <CommandItem value={`typed:${suggest.typed}`} onSelect={() => pick({ handle: suggest.typed })} className="gap-2">
                                <Plus className="size-4" />
                                <span className="truncate">
                                    Watch <span className="font-medium">@{suggest.typed}</span>
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </PopoverContent>
            </Popover>
        </Command>
    );
}

const bareHandle = (creator: CONTENT_LAB_SUGGESTION) => creator.handle.replace(/^@+/, '');
const rowValue = (creator: CONTENT_LAB_SUGGESTION) => `${creator.platform}:${bareHandle(creator)}`;

function SuggestionRow({ creator, onPick }: { creator: CONTENT_LAB_SUGGESTION; onPick: (pick: WatchPick) => void }) {
    const handle = bareHandle(creator);
    return (
        <CommandItem
            value={rowValue(creator)}
            onSelect={() => onPick({ handle, name: creator.name, avatarUrl: creator.avatarUrl })}
            className="gap-3 py-2"
            data-testid="creator-suggestion"
        >
            <CreatorAvatar name={creator.name} handle={handle} avatarUrl={creator.avatarUrl} className="size-9" />
            <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1 font-medium">
                    <span className="truncate">{creator.name ?? `@${handle}`}</span>
                    {creator.verified ? <BadgeCheck className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-label="Verified" /> : null}
                </span>
                <span className="text-muted-foreground truncate text-xs">@{handle}</span>
            </span>
            {creator.followers != null ? (
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{compactNumber(creator.followers)} followers</span>
            ) : null}
        </CommandItem>
    );
}
