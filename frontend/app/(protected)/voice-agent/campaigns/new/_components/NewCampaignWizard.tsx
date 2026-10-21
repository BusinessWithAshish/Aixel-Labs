'use client';

import { FormProvider } from 'react-hook-form';
import Link from 'next/link';
import { Check, Loader2, Megaphone } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS, type UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';
import { StepContacts } from './StepContacts';
import { StepDetails } from './StepDetails';
import { StepReview } from './StepReview';
import { StepSchedule } from './StepSchedule';

const STEP_TEXT = [
    { title: 'Who calls', description: 'Name the campaign, and pick the agent and the number it calls from.' },
    { title: 'Who to call', description: 'Upload your contacts as a CSV and say which column is which.' },
    { title: 'When to call', description: 'Calling hours, how many calls at once, and when to try again.' },
    { title: 'Review', description: 'Check everything, then start now or keep it as a draft.' },
];

function Stepper() {
    const { step, goTo } = usePage<UseNewCampaignPageReturn>();
    return (
        <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Steps">
            {WIZARD_STEPS.map((label, index) => {
                const done = index < step;
                const current = index === step;
                return (
                    <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                        <button
                            type="button"
                            onClick={() => goTo(index)}
                            aria-current={current ? 'step' : undefined}
                            className={cn(
                                'flex min-w-0 items-center gap-2 rounded-md text-sm',
                                current ? 'text-foreground font-medium' : 'text-muted-foreground',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums',
                                    current && 'border-primary bg-primary text-primary-foreground',
                                    done && 'border-primary text-primary',
                                )}
                            >
                                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
                            </span>
                            <span className={cn('truncate', !current && 'hidden sm:inline')}>{label}</span>
                        </button>
                        {index < WIZARD_STEPS.length - 1 ? <span className="bg-border h-px min-w-3 flex-1" aria-hidden /> : null}
                    </li>
                );
            })}
        </ol>
    );
}

function Footer() {
    const { step, back, next, problem, submit, submitting } = usePage<UseNewCampaignPageReturn>();
    const last = step === WIZARD_STEPS.length - 1;
    return (
        <CardFooter className="flex flex-col-reverse gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || !!submitting} className="w-full sm:w-auto">
                Back
            </Button>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                {problem && !last ? (
                    <span className="text-muted-foreground text-center text-xs sm:text-right" data-testid="wizard-problem">
                        {problem}
                    </span>
                ) : null}
                {last ? (
                    <>
                        <Button type="button" variant="outline" disabled={!!submitting} onClick={() => void submit(false)}>
                            {submitting === 'draft' ? <Loader2 className="size-4 animate-spin" /> : null}
                            Save as draft
                        </Button>
                        <Button type="button" disabled={!!submitting} onClick={() => void submit(true)}>
                            {submitting === 'start' ? <Loader2 className="size-4 animate-spin" /> : null}
                            Create and start
                        </Button>
                    </>
                ) : (
                    <Button type="button" onClick={next} disabled={!!problem}>
                        Next
                    </Button>
                )}
            </div>
        </CardFooter>
    );
}

export function NewCampaignWizard() {
    const { step, agents, numbers, loadError, form } = usePage<UseNewCampaignPageReturn>();

    if (loadError) {
        return (
            <Alert variant="destructive" className="m-1">
                <AlertDescription>{loadError}</AlertDescription>
            </Alert>
        );
    }
    if (agents.length === 0 || numbers.length === 0) {
        const needsAgent = agents.length === 0;
        return (
            <EmptyState
                icon={<Megaphone />}
                title={needsAgent ? 'Create an outbound agent first' : 'Connect a number first'}
                description={
                    needsAgent
                        ? 'A campaign needs an outbound agent to place its calls.'
                        : 'A campaign calls from one of your own numbers (Telnyx, Twilio or VoiceLink).'
                }
                className="m-1"
                data-testid="campaign-setup-missing"
            >
                <Button asChild variant="outline" size="sm">
                    <Link href={SubModuleUrls[needsAgent ? VOICE_AGENT_SUB_MODULES.AGENTS : VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}>
                        {needsAgent ? 'Open agents' : 'Open phone numbers'}
                    </Link>
                </Button>
            </EmptyState>
        );
    }

    const text = STEP_TEXT[step];
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-1">
            <Stepper />
            <Card className="gap-4">
                <CardHeader>
                    <CardTitle>{text.title}</CardTitle>
                    <CardDescription>{text.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormProvider {...form}>
                        {step === 0 ? <StepDetails /> : null}
                        {step === 1 ? <StepContacts /> : null}
                        {step === 2 ? <StepSchedule /> : null}
                        {step === 3 ? <StepReview /> : null}
                    </FormProvider>
                </CardContent>
                <Footer />
            </Card>
        </div>
    );
}
