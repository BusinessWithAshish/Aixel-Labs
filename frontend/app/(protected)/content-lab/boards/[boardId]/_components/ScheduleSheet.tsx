'use client';

import { useEffect, useState } from 'react';
import { differenceInCalendarDays, format, formatDistanceToNow, formatRelative } from 'date-fns';
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Pause, Play, RefreshCw, Save } from 'lucide-react';
import {
    CONTENT_LAB_SCHEDULE_EVERY_HOURS,
    type ContentLabBoardRun,
    type ContentLabBoardRunStatus,
    type ContentLabBoardSchedule,
    type ContentLabScheduleRepeat,
    type VoiceWeekday,
} from '@aixellabs/backend/db/types';
import { TimezoneSelect } from '@/components/common/voice-agent/TimezoneSelect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePage } from '@/contexts/PageStore';
import { browserTimezone, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_FORMAT_LABELS } from '../../../_constants';
import { clockLabel, describeSchedule, nextScheduledRun } from '../../_utils/schedule';
import type { UseBoardPageReturn } from '../_hooks/use-board-page';

const REPEAT_OPTIONS: { value: ContentLabScheduleRepeat; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekdays', label: 'Some days' },
    { value: 'hours', label: 'Every few hours' },
];

const RUN_STATUS: Record<ContentLabBoardRunStatus, { label: string; className: string }> = {
    running: { label: 'Running', className: 'bg-muted text-muted-foreground' },
    done: { label: 'Worked', className: 'bg-green-500/15 text-green-700 dark:text-green-300' },
    partial: { label: 'Partly worked', className: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
    failed: { label: 'Failed', className: 'bg-destructive/15 text-destructive' },
};

/** "tomorrow at 9:00 AM (in 14 hours)", or "Mon 10 Nov at 9:00 AM" further out. In the viewer's own time. */
export function nextRunLabel(iso: string): string {
    const at = new Date(iso);
    const now = new Date();
    const when = Math.abs(differenceInCalendarDays(at, now)) <= 6 ? formatRelative(at, now) : format(at, "EEE d MMM 'at' h:mm a");
    return `${when} (${formatDistanceToNow(at, { addSuffix: true })})`;
}

/** Clock times an "every N hours" schedule runs at: "12 AM, 6 AM, 12 PM and 6 PM". */
function slotsLabel(everyHours: number): string {
    if (everyHours === 1) return 'at the top of every hour';
    const slots = Array.from({ length: 24 / everyHours }, (_, index) => clockLabel(`${String(index * everyHours).padStart(2, '0')}:00`));
    return `at ${slots.slice(0, -1).join(', ')} and ${slots[slots.length - 1]}`;
}

function RunStatusBadge({ status }: { status: ContentLabBoardRunStatus }) {
    return (
        <Badge variant="outline" className={cn('border-transparent', RUN_STATUS[status].className)}>
            {RUN_STATUS[status].label}
        </Badge>
    );
}

function RunRow({ run, onShow }: { run: ContentLabBoardRun; onShow: (run: ContentLabBoardRun) => void }) {
    return (
        <li className="rounded-md border" data-testid="schedule-run">
            <Collapsible>
                <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-start gap-2 px-3 py-2 text-left">
                    {run.status === 'running' ? (
                        <Loader2 className="text-muted-foreground mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                    ) : run.status === 'done' ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden />
                    ) : (
                        <AlertCircle className={cn('mt-0.5 size-4 shrink-0', run.status === 'failed' ? 'text-destructive' : 'text-amber-600')} aria-hidden />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium" suppressHydrationWarning>
                            {format(new Date(run.startedAt), "EEE d MMM, h:mm a")}
                        </span>
                        <span className="text-muted-foreground text-xs">{run.summary}</span>
                    </span>
                    <RunStatusBadge status={run.status} />
                    <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-2 border-t px-3 py-2 text-xs">
                    {run.outputs.length ? (
                        run.outputs.map((output) => (
                            <div key={output.nodeId} className="grid gap-0.5">
                                <p className="font-medium">{CONTENT_LAB_FORMAT_LABELS[output.format]} draft</p>
                                <p className="text-muted-foreground line-clamp-3 whitespace-pre-line">{output.text}</p>
                            </div>
                        ))
                    ) : (
                        <p className="text-muted-foreground">No drafts in this run.</p>
                    )}
                    {run.nodes.some((node) => node.status === 'error') ? (
                        <ul className="text-destructive grid gap-0.5">
                            {run.nodes
                                .filter((node) => node.status === 'error')
                                .map((node) => (
                                    <li key={node.nodeId}>{node.error}</li>
                                ))}
                        </ul>
                    ) : null}
                    {run.status !== 'running' ? (
                        <Button size="sm" variant="outline" className="w-fit" onClick={() => onShow(run)}>
                            Show on the board
                        </Button>
                    ) : null}
                </CollapsibleContent>
            </Collapsible>
        </li>
    );
}

/**
 * Schedule: when the board runs by itself on the server (off / every day / some days / every few
 * hours, in a timezone), its next run in plain words, pause / resume, and the last runs.
 */
export function ScheduleSheet() {
    const page = usePage<UseBoardPageReturn>();
    const { schedule: sched, saving: boardSave } = page;
    const [form, setForm] = useState<ContentLabBoardSchedule>(sched.schedule);

    // Start the form from what is saved each time the sheet opens; a first schedule defaults to this browser's timezone.
    useEffect(() => {
        if (!sched.open) return;
        setForm(sched.hasSchedule ? sched.schedule : { ...sched.schedule, timezone: browserTimezone() });
    }, [sched.open, sched.hasSchedule, sched.schedule]);

    const set = (patch: Partial<ContentLabBoardSchedule>) => setForm((current) => ({ ...current, ...patch }));
    const preview = nextScheduledRun(form, new Date());
    const active = sched.hasSchedule && sched.schedule.repeat !== 'off';
    const lastRun = sched.runs[0];
    const changed = JSON.stringify(form) !== JSON.stringify(sched.schedule) || !sched.hasSchedule;
    const showRun = (run: ContentLabBoardRun) => {
        page.showScheduledRun(run);
        sched.setOpen(false);
    };

    return (
        <Sheet open={sched.open} onOpenChange={sched.setOpen}>
            <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md" data-testid="schedule-sheet">
                <SheetHeader>
                    <SheetTitle>Schedule this board</SheetTitle>
                    <SheetDescription>
                        It runs by itself on our servers, even with this page closed: fresh posts in, new drafts out. It uses the board as
                        last saved and writes on your AI key.
                    </SheetDescription>
                </SheetHeader>

                <div className="grid gap-5 px-4 pb-6">
                    <section className="bg-muted/50 grid gap-2 rounded-lg p-3" aria-label="Current schedule" data-testid="schedule-status">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="flex-1 text-sm font-semibold">{active ? describeSchedule(sched.schedule) : 'Not scheduled'}</p>
                            {active ? (
                                <Badge variant="outline" className={cn('border-transparent', sched.schedule.paused ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'bg-green-500/15 text-green-700 dark:text-green-300')}>
                                    {sched.schedule.paused ? 'Paused' : 'On'}
                                </Badge>
                            ) : null}
                        </div>
                        {active ? (
                            <>
                                <p className="text-muted-foreground text-xs">Timezone: {sched.schedule.timezone.replace(/_/g, ' ')}</p>
                                <p className="text-sm" data-testid="schedule-next" suppressHydrationWarning>
                                    {sched.schedule.paused
                                        ? 'Paused: it will not run until you resume it.'
                                        : sched.nextRunAt
                                          ? `Next run: ${nextRunLabel(sched.nextRunAt)}`
                                          : 'No next run.'}
                                </p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-fit"
                                    disabled={sched.saving}
                                    onClick={() => void sched.setPaused(!sched.schedule.paused)}
                                >
                                    {sched.schedule.paused ? <Play /> : <Pause />}
                                    {sched.schedule.paused ? 'Resume' : 'Pause'}
                                </Button>
                            </>
                        ) : (
                            <p className="text-muted-foreground text-xs">Pick when it should run below.</p>
                        )}
                    </section>

                    {boardSave.dirty ? (
                        <Alert>
                            <AlertDescription className="flex flex-wrap items-center gap-2">
                                <span className="flex-1">You have unsaved changes. Scheduled runs use the last saved board.</span>
                                <Button size="sm" onClick={() => void boardSave.save()} disabled={boardSave.saveState === 'saving'}>
                                    <Save /> Save board
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void sched.save(form, form.repeat === 'off' ? 'Schedule turned off' : 'Schedule saved');
                        }}
                    >
                        <div className="grid gap-1.5">
                            <Label id="schedule-repeat-label">Repeat</Label>
                            <ToggleGroup
                                type="single"
                                variant="outline"
                                spacing={1}
                                className="grid w-full grid-cols-2"
                                value={form.repeat}
                                onValueChange={(value) => value && set({ repeat: value as ContentLabScheduleRepeat })}
                                aria-labelledby="schedule-repeat-label"
                            >
                                {REPEAT_OPTIONS.map((option) => (
                                    <ToggleGroupItem key={option.value} value={option.value} className="w-full rounded-md">
                                        {option.label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>

                        {form.repeat === 'weekdays' ? (
                            <div className="grid gap-1.5">
                                <Label id="schedule-days-label">On these days</Label>
                                <ToggleGroup
                                    type="multiple"
                                    variant="outline"
                                    spacing={1}
                                    className="grid w-full grid-cols-7"
                                    value={form.days}
                                    onValueChange={(value) => set({ days: value as VoiceWeekday[] })}
                                    aria-labelledby="schedule-days-label"
                                >
                                    {VOICE_WEEKDAY_OPTIONS.map((day) => (
                                        <ToggleGroupItem key={day.key} value={day.key} aria-label={day.label} className="w-full rounded-md px-0 text-xs">
                                            {day.short}
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                                {form.days.length === 0 ? <p className="text-destructive text-xs">Pick at least one day.</p> : null}
                            </div>
                        ) : null}

                        {form.repeat === 'daily' || form.repeat === 'weekdays' ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor="schedule-time">At</Label>
                                <Input
                                    id="schedule-time"
                                    type="time"
                                    step={300}
                                    className="w-40"
                                    value={form.time}
                                    onChange={(event) => event.target.value && set({ time: event.target.value })}
                                />
                            </div>
                        ) : null}

                        {form.repeat === 'hours' ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor="schedule-every">How often</Label>
                                <Select value={String(form.everyHours)} onValueChange={(value) => set({ everyHours: Number(value) })}>
                                    <SelectTrigger id="schedule-every" className="w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTENT_LAB_SCHEDULE_EVERY_HOURS.map((hours) => (
                                            <SelectItem key={hours} value={String(hours)}>
                                                {hours === 1 ? 'Every hour' : `Every ${hours} hours`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-muted-foreground text-xs">Runs {slotsLabel(form.everyHours)}.</p>
                            </div>
                        ) : null}

                        {form.repeat !== 'off' ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor="schedule-timezone">Timezone</Label>
                                <TimezoneSelect id="schedule-timezone" value={form.timezone} onChange={(timezone) => set({ timezone })} />
                            </div>
                        ) : null}

                        {form.repeat !== 'off' ? (
                            <p className="text-sm" data-testid="schedule-preview" suppressHydrationWarning>
                                {preview ? (
                                    <>
                                        {describeSchedule(form)}. First run: <span className="font-medium">{nextRunLabel(preview.toISOString())}</span>.
                                    </>
                                ) : (
                                    'Pick at least one day.'
                                )}
                                <span className="text-muted-foreground block text-xs">Runs start within a few minutes of the time.</span>
                            </p>
                        ) : null}

                        <Button
                            type="submit"
                            className="w-fit"
                            disabled={sched.saving || !changed || (form.repeat === 'weekdays' && form.days.length === 0)}
                        >
                            {sched.saving ? <Loader2 className="animate-spin" /> : <Save />}
                            {form.repeat === 'off' ? 'Turn off schedule' : 'Save schedule'}
                        </Button>
                    </form>

                    <section className="grid gap-2" aria-labelledby="schedule-history-title">
                        <div className="flex items-center gap-2">
                            <h3 id="schedule-history-title" className="flex-1 text-sm font-semibold">
                                Scheduled runs
                            </h3>
                            <Button size="sm" variant="ghost" onClick={() => void sched.refresh()} disabled={sched.refreshing} aria-label="Refresh runs">
                                <RefreshCw className={cn(sched.refreshing && 'animate-spin')} /> Refresh
                            </Button>
                        </div>
                        {lastRun ? (
                            <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                                Last run {formatDistanceToNow(new Date(lastRun.startedAt), { addSuffix: true })}: {lastRun.summary}
                            </p>
                        ) : null}
                        {sched.runs.length ? (
                            <ul className="grid gap-2">
                                {sched.runs.map((run) => (
                                    <RunRow key={run._id} run={run} onShow={showRun} />
                                ))}
                            </ul>
                        ) : (
                            <p className="text-muted-foreground text-sm">No scheduled runs yet. Each one shows up here with the drafts it wrote.</p>
                        )}
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}
