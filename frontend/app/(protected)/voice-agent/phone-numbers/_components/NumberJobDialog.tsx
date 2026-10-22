'use client';

import Link from 'next/link';
import { Controller, FormProvider } from 'react-hook-form';
import { Circle, CircleCheck, CircleX, Loader2, PhoneIncoming, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { SelectControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { cn } from '@/lib/utils';
import { useNumberJobForm, type JobRun } from '../_hooks/use-number-job-form';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { agentName, jobAgentId, jobSummary, numberJob, type NumberJob } from '../_utils/number-job';

const AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];
const link = 'text-primary font-medium underline-offset-4 hover:underline';

function CreateAgentHint({ kind }: { kind: string }) {
    return (
        <>
            No agent {kind} yet.{' '}
            <Link className={link} href={AGENTS_URL}>
                Create one
            </Link>
        </>
    );
}

type StepState = 'done' | 'running' | 'failed' | 'waiting';

const STEP_ICON: Record<StepState, React.ReactNode> = {
    done: <CircleCheck className="size-4 text-green-600" aria-hidden />,
    running: <Loader2 className="text-primary size-4 animate-spin" aria-hidden />,
    failed: <CircleX className="text-destructive size-4" aria-hidden />,
    waiting: <Circle className="text-muted-foreground size-4" aria-hidden />,
};

/** The steps of a change: a numbered preview before saving, then each one's progress. */
function StepList({ steps, run }: { steps: { title: string }[]; run?: JobRun }) {
    const stateOf = (i: number): StepState => {
        if (!run || i > run.done) return 'waiting';
        if (i < run.done) return 'done';
        return run.error ? 'failed' : 'running';
    };
    return (
        <ol className="grid gap-2 text-sm">
            {steps.map((step, i) => (
                <li key={step.title} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                        {run ? STEP_ICON[stateOf(i)] : <span className="text-muted-foreground tabular-nums">{i + 1}.</span>}
                    </span>
                    <span className={cn(run && stateOf(i) === 'waiting' && 'text-muted-foreground')}>{step.title}</span>
                </li>
            ))}
        </ol>
    );
}

/** Where the number stands now, after a change finished or stopped part-way. */
function standing(number: VoiceNumberListItem, agents: UsePhoneNumbersPageReturn['agents']): string {
    const job = numberJob(number);
    if (job === null) return `${number.phoneNumber} still answers calls and makes calls.`;
    return jobSummary(job, agentName(number, agents, jobAgentId(number, job)), number.phoneNumber);
}

function NumberJobContent({ number }: { number: VoiceNumberListItem }) {
    const { agents, hasGeminiKey, closeJobDialog } = usePage<UsePhoneNumbersPageReturn>();
    const dialog = useNumberJobForm(number);
    const { run, running, job } = dialog;
    const provider = numberProviderInfo(number.provider).label;
    const noKey = 'Needs your Gemini API key first.';
    // No closing while the provider is being changed: the steps must be seen to the end.
    const holdOpen = (event: Event) => running && event.preventDefault();

    const jobs: RadioCardOption<NumberJob>[] = [
        {
            value: VoiceAgentCallType.INBOUND,
            title: 'Answer calls',
            description: dialog.canAnswer ? (
                'Your AI agent picks up calls to this number.'
            ) : hasGeminiKey ? (
                <CreateAgentHint kind="answers calls" />
            ) : (
                noKey
            ),
            media: <PhoneIncoming className="size-4" aria-hidden />,
            disabled: !dialog.canAnswer,
        },
        {
            value: VoiceAgentCallType.OUTBOUND,
            title: 'Make calls',
            description: dialog.canCall ? (
                'Your AI agent calls people from this number.'
            ) : hasGeminiKey ? (
                <CreateAgentHint kind="makes calls" />
            ) : (
                noKey
            ),
            media: <PhoneOutgoing className="size-4" aria-hidden />,
            disabled: !dialog.canCall,
        },
        {
            value: 'NONE',
            title: 'Not used yet',
            description: 'Calls ring the way they always have.',
            media: <PhoneOff className="size-4" aria-hidden />,
        },
    ];

    if (run) {
        const finished = !run.error && run.done === run.steps.length;
        return (
            <DialogContent
                className="sm:max-w-lg"
                showCloseButton={!running}
                onEscapeKeyDown={holdOpen}
                onInteractOutside={holdOpen}
            >
                <DialogHeader>
                    <DialogTitle>
                        {running ? `Updating ${number.phoneNumber}…` : finished ? 'All set' : 'That did not finish'}
                    </DialogTitle>
                    <DialogDescription>
                        {running ? `Talking to ${provider}. This takes a few seconds.` : number.phoneNumber}
                    </DialogDescription>
                </DialogHeader>
                <div role="status" aria-live="polite" className="grid gap-4">
                    <StepList steps={run.steps} run={run} />
                    {finished ? (
                        <Alert>
                            <CircleCheck className="size-4 text-green-600" aria-hidden />
                            <AlertDescription>{jobSummary(run.job, run.agentName, number.phoneNumber)}</AlertDescription>
                        </Alert>
                    ) : null}
                    {run.error ? (
                        <Alert variant="destructive">
                            <CircleX className="size-4" aria-hidden />
                            <AlertDescription>
                                <p>{run.error}</p>
                                <p>Right now: {standing(number, agents)}</p>
                            </AlertDescription>
                        </Alert>
                    ) : null}
                </div>
                <DialogFooter>
                    {run.error ? (
                        <Button type="button" variant="outline" onClick={dialog.editAgain}>
                            Back
                        </Button>
                    ) : null}
                    <Button type="button" disabled={running} onClick={closeJobDialog}>
                        {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                        {running ? 'Working…' : 'Close'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        );
    }

    return (
        <DialogContent className="sm:max-w-lg">
            <FormProvider {...dialog.form}>
                <form onSubmit={dialog.save} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>What {number.phoneNumber} does</DialogTitle>
                        <DialogDescription>A number does one job. Nothing changes until you save.</DialogDescription>
                    </DialogHeader>
                    <Controller
                        control={dialog.form.control}
                        name="job"
                        render={({ field }) => (
                            <Field>
                                <FieldLabel id={`job-${number._id}`}>Job</FieldLabel>
                                <RadioCards
                                    aria-labelledby={`job-${number._id}`}
                                    value={field.value}
                                    onValueChange={dialog.chooseJob}
                                    options={jobs}
                                    className="sm:grid-cols-1"
                                    classNames={{ card: 'p-3!' }}
                                />
                            </Field>
                        )}
                    />
                    {job !== 'NONE' ? (
                        <SelectControlledField
                            name="agentId"
                            id={`agent-${number._id}`}
                            label={job === VoiceAgentCallType.INBOUND ? 'Agent that answers' : 'Agent that makes the calls'}
                            placeholder="Choose an agent"
                            options={dialog.agentOptions}
                        />
                    ) : null}
                    {dialog.blockedByKey ? (
                        <Alert>
                            <AlertDescription>
                                <p>
                                    Add your Gemini API key before the AI can answer or make calls.{' '}
                                    <Link className={link} href={GEMINI_KEY_URL}>
                                        Add key
                                    </Link>
                                </p>
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    <section aria-label="What happens when you save" className="bg-muted/50 grid gap-2 rounded-lg p-3">
                        <p className="text-sm font-medium">What happens when you save</p>
                        {dialog.steps.length > 0 ? (
                            <>
                                <StepList steps={dialog.steps} />
                                <p className="text-muted-foreground text-xs">
                                    {jobSummary(job, agentName(number, agents, dialog.agentId), number.phoneNumber)}
                                </p>
                            </>
                        ) : (
                            <p className="text-muted-foreground text-sm">Nothing changes. Pick another job or agent.</p>
                        )}
                    </section>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeJobDialog}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={dialog.steps.length === 0 || dialog.blockedByKey}>
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </FormProvider>
        </DialogContent>
    );
}

/** Changes what a number does: the choice is a draft until Save, then each step shows its progress and result. */
export function NumberJobDialog() {
    const { jobNumber, jobDialog, closeJobDialog } = usePage<UsePhoneNumbersPageReturn>();
    return (
        <Dialog open={jobDialog.open && jobNumber !== null} onOpenChange={(open) => !open && closeJobDialog()}>
            {jobNumber ? <NumberJobContent key={jobDialog.opened} number={jobNumber} /> : null}
        </Dialog>
    );
}
