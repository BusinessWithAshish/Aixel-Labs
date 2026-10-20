'use client';

import { useMemo, useState } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { canonicalTimezone } from '../../_utils/booking-draft';

type TimezoneOption = { value: string; label: string };

let cachedOptions: TimezoneOption[] | null = null;

/** "GMT+5:30" for a zone right now, or "" when the browser cannot say. */
function offsetOf(zone: string): string {
    try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
            .formatToParts(new Date())
            .find((p) => p.type === 'timeZoneName');
        return part?.value ?? '';
    } catch {
        return '';
    }
}

/** Every IANA zone the browser knows, "Asia/Kolkata (GMT+5:30)". Built once, when first opened. */
function timezoneOptions(): TimezoneOption[] {
    if (cachedOptions) return cachedOptions;
    let zones: string[] = [];
    try {
        zones = Intl.supportedValuesOf('timeZone');
    } catch {
        zones = [];
    }
    zones = [...new Set(zones.map(canonicalTimezone))];
    if (!zones.includes('UTC')) zones = ['UTC', ...zones];
    cachedOptions = zones.map((zone) => {
        const offset = offsetOf(zone);
        return { value: zone, label: offset ? `${zone.replace(/_/g, ' ')} (${offset})` : zone.replace(/_/g, ' ') };
    });
    return cachedOptions;
}

type TimezoneSelectProps = {
    id?: string;
    value: string;
    onChange: (zone: string) => void;
    disabled?: boolean;
    className?: string;
};

/** A searchable list of timezones ("kolkata", "new york", "london"). */
export function TimezoneSelect({ id, value, onChange, disabled, className }: TimezoneSelectProps) {
    const [open, setOpen] = useState(false);
    const options = useMemo(() => (open ? timezoneOptions() : []), [open]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('w-full justify-between font-normal', className)}
                >
                    <span className="truncate">{value.replace(/_/g, ' ')}</span>
                    <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search a city or region" />
                    <CommandList className="max-h-72">
                        <CommandEmpty>No timezone found.</CommandEmpty>
                        {options.map((option) => (
                            <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <CheckIcon className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                {option.label}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
