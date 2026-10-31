'use client';

import { ChevronDownIcon } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_SOURCES, type ContentLabPlatformFilter } from '../../_constants';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { filterOf, platformsOf } from '../_utils/smart-box';

type SourcePickerProps = {
    value: ContentLabPlatformFilter;
    onValueChange: (value: ContentLabPlatformFilter) => void;
    className?: string;
};

/**
 * Which sources the search runs on, at the start of the search bar: one or several, never none.
 * Shows the chosen logos (and their names from `sm` up); the menu says what each source brings back.
 */
export function SourcePicker({ value, onValueChange, className }: SourcePickerProps) {
    const chosen = platformsOf(value);
    const names = CONTENT_LAB_SOURCES.filter((source) => chosen.includes(source.platform)).map((source) => source.label);
    const toggle = (platform: (typeof chosen)[number], on: boolean) => {
        const next = on ? [...chosen, platform] : chosen.filter((p) => p !== platform);
        if (next.length) onValueChange(filterOf(next));
    };

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
                type="button"
                aria-label={`Sources: ${names.join(' and ')}`}
                className={cn(
                    'hover:bg-muted data-[state=open]:bg-muted flex h-full shrink-0 items-center gap-2 rounded-l-[inherit] pr-2 pl-3 text-sm font-medium outline-hidden',
                    'focus-visible:bg-muted',
                    className,
                )}
            >
                <span className="flex items-center gap-1.5">
                    {chosen.map((platform) => (
                        <PlatformIcon key={platform} platform={platform} className="size-4" />
                    ))}
                </span>
                <span className="hidden sm:inline">{names.join(' + ')}</span>
                <ChevronDownIcon className="text-muted-foreground size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">Search in</DropdownMenuLabel>
                {CONTENT_LAB_SOURCES.map((source) => {
                    const on = chosen.includes(source.platform);
                    return (
                        <DropdownMenuCheckboxItem
                            key={source.platform}
                            checked={on}
                            // The last one stays: a search needs a source.
                            disabled={on && chosen.length === 1}
                            onCheckedChange={(next) => toggle(source.platform, next)}
                            // Stay open, so several can be picked in a row.
                            onSelect={(event) => event.preventDefault()}
                            className="gap-3 py-2"
                        >
                            <PlatformIcon platform={source.platform} className="size-5" />
                            <span className="grid">
                                <span className="font-medium">{source.label}</span>
                                <span className="text-muted-foreground text-xs">{source.gives}</span>
                            </span>
                        </DropdownMenuCheckboxItem>
                    );
                })}
                <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">Pick one or both.</p>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
