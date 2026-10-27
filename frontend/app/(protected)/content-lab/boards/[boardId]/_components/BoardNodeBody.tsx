'use client';

import Link from 'next/link';
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, X } from 'lucide-react';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_WRITE_FORMATS, ContentLabNodeKind, type ContentLabWriteFormat } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CONTENT_LAB_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import {
    CONTENT_LAB_COUNTRIES,
    CONTENT_LAB_FORMAT_LABELS,
    CONTENT_LAB_LANGUAGES,
    CONTENT_LAB_NODE_META,
    CONTENT_LAB_NODE_TAG_LABELS,
    CONTENT_LAB_PLATFORM_LABELS,
    type ContentLabNodeTag,
} from '../../../_constants';
import type { UseBoardPageReturn } from '../_hooks/use-board-page';
import type { BoardNodeRun } from '../_utils/run-board';

const TAG_CLASS: Record<ContentLabNodeTag, string> = {
    auto: 'bg-primary/10 text-primary',
    live: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    you: 'bg-muted text-muted-foreground',
};

export function NodeTagBadge({ kind }: { kind: ContentLabNodeKind }) {
    const { tag } = CONTENT_LAB_NODE_META[kind];
    return (
        <Badge variant="outline" className={cn('border-transparent font-mono text-[10px] uppercase tracking-wider', TAG_CLASS[tag])}>
            {CONTENT_LAB_NODE_TAG_LABELS[tag]}
        </Badge>
    );
}

export function NodeStatusIcon({ run }: { run?: BoardNodeRun }) {
    if (!run) return null;
    if (run.status === 'running') return <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Running" />;
    if (run.status === 'error') return <AlertCircle className="text-destructive size-4" aria-label="Failed" />;
    return <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-label="Done" />;
}

export const MultipleChip = ({ multiple }: { multiple: number }) => (
    <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-orange-700 dark:text-orange-300">
        {multiple}x
    </span>
);

const SETTINGS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS];
const WATCHING_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.WATCHING];

type FieldProps = { id: string; label: string; children: React.ReactNode };
const Field = ({ id, label, children }: FieldProps) => (
    <div className="grid gap-1">
        <label htmlFor={id} className="text-muted-foreground text-xs font-medium">
            {label}
        </label>
        {children}
    </div>
);

function OptionSelect<T extends string>({
    id,
    value,
    options,
    onChange,
}: {
    id: string;
    value: T | undefined;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <Select value={value} onValueChange={(next) => onChange(next as T)}>
            <SelectTrigger id={id} size="sm" className="nodrag w-full">
                <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

const COUNTRY_OPTIONS = CONTENT_LAB_COUNTRIES.map(({ code, label }) => ({ value: code as string, label }));
const LANGUAGE_OPTIONS = CONTENT_LAB_LANGUAGES.map((language) => ({ value: language as string, label: language }));
const FORMAT_OPTIONS = CONTENT_LAB_WRITE_FORMATS.map((format) => ({ value: format, label: CONTENT_LAB_FORMAT_LABELS[format] }));
const PLATFORM_OPTIONS = CONTENT_LAB_PLATFORMS.map((platform) => ({ value: platform, label: CONTENT_LAB_PLATFORM_LABELS[platform] }));

function RunResult({ run }: { run: BoardNodeRun }) {
    if (run.status === 'running') return <p className="text-muted-foreground text-xs">Running…</p>;
    if (run.status === 'error') return <p className="text-destructive text-xs" role="alert">{run.error}</p>;
    return (
        <div className="grid gap-1.5 text-xs" data-testid="node-result">
            {run.notice ? <p className="bg-muted text-muted-foreground rounded-md px-2 py-1.5">{run.notice}</p> : null}
            {run.items?.map((item, index) => (
                <div key={index} className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0">
                        {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer" className="nodrag block truncate font-medium hover:underline">
                                {item.label}
                            </a>
                        ) : (
                            <span className="block truncate font-medium">{item.label}</span>
                        )}
                        {item.detail ? <span className="text-muted-foreground block truncate">{item.detail}</span> : null}
                    </div>
                    {item.multiple ? <MultipleChip multiple={item.multiple} /> : null}
                </div>
            ))}
            {run.lines?.length ? (
                <ul className="grid list-disc gap-1 pl-4">
                    {run.lines.map((line, index) => (
                        <li key={index}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {run.check ? (
                <div className="grid gap-1.5">
                    <p className="text-2xl font-bold tabular-nums">
                        {run.check.score}
                        <span className="text-muted-foreground text-sm font-medium">/100</span>
                    </p>
                    <ul className="grid gap-1">
                        {run.check.checks.map((item, index) => (
                            <li key={index} className="flex gap-1.5">
                                {item.passed ? (
                                    <Check className="mt-0.5 size-3.5 shrink-0 text-green-600 dark:text-green-400" aria-label="Passed" />
                                ) : (
                                    <X className="text-destructive mt-0.5 size-3.5 shrink-0" aria-label="Missed" />
                                )}
                                <span>
                                    <span className="font-medium">{item.label}</span>
                                    {item.detail ? <span className="text-muted-foreground"> · {item.detail}</span> : null}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {run.summary ? <p className="text-muted-foreground">{run.summary}</p> : null}
        </div>
    );
}

/** A box's settings and, after a run, what it found. Shared by the canvas node and the Flow card. */
export function BoardNodeBody({ id }: { id: string }) {
    const page = usePage<UseBoardPageReturn>();
    const node = page.nodes.find((item) => item.id === id);
    if (!node) return null;
    const { kind, settings } = node.data;
    const run = page.runs[id];
    const set = (patch: Parameters<UseBoardPageReturn['updateSettings']>[1]) => page.updateSettings(id, patch);
    const field = (name: string) => `${id}-${name}`;

    return (
        <div className="grid gap-2.5">
            {kind === ContentLabNodeKind.VOICE ? (
                <p className="text-muted-foreground text-xs">
                    {Object.values(page.profile.handles).some(Boolean) ? (
                        <>
                            From{' '}
                            {(Object.entries(page.profile.handles) as [ContentLabPlatform, string][])
                                .filter(([, handle]) => handle)
                                .map(([platform, handle]) => `@${handle} (${CONTENT_LAB_PLATFORM_LABELS[platform]})`)
                                .join(', ')}
                        </>
                    ) : (
                        <>
                            Add your own accounts in{' '}
                            <Link href={SETTINGS_URL} className="text-primary nodrag font-medium hover:underline">
                                Settings
                            </Link>
                        </>
                    )}
                </p>
            ) : null}

            {kind === ContentLabNodeKind.WATCHING ? (
                <p className="text-muted-foreground text-xs">
                    Standouts from{' '}
                    <Link href={WATCHING_URL} className="text-primary nodrag font-medium hover:underline">
                        creators you watch
                    </Link>
                </p>
            ) : null}

            {kind === ContentLabNodeKind.WORKING || kind === ContentLabNodeKind.ADS ? (
                <Field id={field('query')} label={kind === ContentLabNodeKind.ADS ? 'Topic or competitor' : 'Topic'}>
                    <Input
                        id={field('query')}
                        className="nodrag h-8 text-sm"
                        value={settings.query ?? ''}
                        maxLength={200}
                        placeholder="protein breakfast"
                        onChange={(event) => set({ query: event.target.value })}
                    />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.WORKING ? (
                <Field id={field('platforms')} label="Platforms">
                    <ToggleGroup
                        id={field('platforms')}
                        type="multiple"
                        variant="outline"
                        size="sm"
                        className="nodrag w-full"
                        value={settings.platforms ?? []}
                        onValueChange={(value) => value.length && set({ platforms: value as ContentLabPlatform[] })}
                    >
                        {PLATFORM_OPTIONS.map((option) => (
                            <ToggleGroupItem key={option.value} value={option.value} className="flex-1 text-xs">
                                {option.label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.WORKING || kind === ContentLabNodeKind.ADS ? (
                <Field id={field('country')} label={kind === ContentLabNodeKind.ADS ? 'Region' : 'Country'}>
                    <OptionSelect id={field('country')} value={settings.country} options={COUNTRY_OPTIONS} onChange={(country) => set({ country })} />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.CREATOR ? (
                <>
                    <Field id={field('platform')} label="Platform">
                        <OptionSelect
                            id={field('platform')}
                            value={settings.platform}
                            options={PLATFORM_OPTIONS}
                            onChange={(platform) => set({ platform })}
                        />
                    </Field>
                    <Field id={field('handle')} label="Handle">
                        <Input
                            id={field('handle')}
                            className="nodrag h-8 text-sm"
                            value={settings.handle ?? ''}
                            maxLength={200}
                            placeholder="@creator"
                            onChange={(event) => set({ handle: event.target.value })}
                        />
                    </Field>
                </>
            ) : null}

            {kind === ContentLabNodeKind.POST ? (
                <Field id={field('url')} label="Link">
                    <Input
                        id={field('url')}
                        className="nodrag h-8 text-sm"
                        type="url"
                        inputMode="url"
                        value={settings.url ?? ''}
                        maxLength={500}
                        placeholder="youtube.com/watch?v=… or instagram.com/reel/…"
                        onChange={(event) => set({ url: event.target.value })}
                    />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.NOTE ? (
                <Field id={field('text')} label="Your note">
                    <Textarea
                        id={field('text')}
                        className="nodrag nowheel min-h-20 text-sm"
                        value={settings.text ?? ''}
                        maxLength={4_000}
                        placeholder="Angle: student budget. Hinglish. Under 40 seconds."
                        onChange={(event) => set({ text: event.target.value })}
                    />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.WRITE || kind === ContentLabNodeKind.OUTPUT ? (
                <Field id={field('format')} label="Format">
                    <OptionSelect<ContentLabWriteFormat>
                        id={field('format')}
                        value={settings.format}
                        options={FORMAT_OPTIONS}
                        onChange={(format) => set({ format })}
                    />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.WRITE ? (
                <Field id={field('language')} label="Language">
                    <OptionSelect id={field('language')} value={settings.language} options={LANGUAGE_OPTIONS} onChange={(language) => set({ language })} />
                </Field>
            ) : null}

            {kind === ContentLabNodeKind.OUTPUT ? (
                <>
                    <Field id={field('draft')} label="Draft">
                        <Textarea
                            id={field('draft')}
                            className="nodrag nowheel min-h-36 text-sm"
                            value={settings.text ?? ''}
                            maxLength={20_000}
                            placeholder="Run the board to write this draft, or type your own."
                            onChange={(event) => set({ text: event.target.value })}
                        />
                    </Field>
                    <Button
                        size="sm"
                        variant="outline"
                        className="nodrag w-fit"
                        disabled={!settings.text?.trim()}
                        onClick={() => page.copyOutput(id)}
                    >
                        <Copy /> Copy
                    </Button>
                </>
            ) : null}

            {run ? (
                <RunResult run={run} />
            ) : kind === ContentLabNodeKind.HOOKS || kind === ContentLabNodeKind.CHECK ? (
                <p className="text-muted-foreground text-xs">{CONTENT_LAB_NODE_META[kind].hint}. Run the board to fill it.</p>
            ) : null}
        </div>
    );
}
