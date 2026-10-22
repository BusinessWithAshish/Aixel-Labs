'use client';

import { BookOpen, Info, PhoneIcon, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { ConnectNumberDialog } from './ConnectNumberDialog';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { TestCallDialog } from '@/components/common/voice-agent/TestCallDialog';
import { SETUP_GUIDE_PROVIDERS, setupGuideFor } from '../_utils/setup-guides';
import { NumberJobDialog } from './NumberJobDialog';
import { PhoneNumberRow } from './PhoneNumberRow';
import { ProviderSetupGuide } from './ProviderSetupGuide';
import { RemoveNumberDialog } from './RemoveNumberDialog';
import { SetupGuideBanner } from './SetupGuideBanner';

function SetupGuideButton() {
    const { openSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    return (
        <Button type="button" variant="outline" onClick={() => openSetupGuide()}>
            <BookOpen className="size-4" aria-hidden />
            Setup guide
        </Button>
    );
}

/** Switches the open guide to another provider's, from its first step. */
function GuideProviderSwitch() {
    const { setupGuide, openSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    if (SETUP_GUIDE_PROVIDERS.length < 2) return null;
    return (
        <div role="radiogroup" aria-label="Setup guide for" className="flex flex-wrap gap-1.5 pt-1">
            {SETUP_GUIDE_PROVIDERS.map((provider) => {
                const checked = provider === setupGuide.provider;
                return (
                    <Button
                        key={provider}
                        type="button"
                        size="sm"
                        variant={checked ? 'secondary' : 'ghost'}
                        role="radio"
                        aria-checked={checked}
                        className="h-7 px-2.5"
                        onClick={() => !checked && openSetupGuide(provider)}
                    >
                        {numberProviderInfo(provider).label}
                    </Button>
                );
            })}
        </div>
    );
}

/** The row's test call: from that number, with any agent (its own picked first). */
function NumberTestCallDialog() {
    const { testCallNumber, setTestCallNumber, agents, geminiKey } = usePage<UsePhoneNumbersPageReturn>();
    return (
        <TestCallDialog
            open={testCallNumber !== null}
            onOpenChange={(open) => !open && setTestCallNumber(null)}
            numbers={testCallNumber ? [testCallNumber] : []}
            agents={agents}
            geminiKey={geminiKey}
        />
    );
}

function SetupGuideDialog() {
    const { setupGuide, closeSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    const guide = setupGuideFor(setupGuide.provider);
    if (!guide) return null;
    return (
        <ProviderSetupGuide
            guide={guide}
            open={setupGuide.open}
            initialStepId={setupGuide.stepId}
            headerExtra={<GuideProviderSwitch />}
            onOpenChange={(open) => {
                if (!open) closeSetupGuide();
            }}
        />
    );
}

export function PhoneNumbersContent() {
    const { numbers, loadError, setConnectOpen, geminiKey } = usePage<UsePhoneNumbersPageReturn>();

    return (
        <>
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            <GeminiKeyNotice view={geminiKey} action="answer or make calls" />

            {numbers.length === 0 ? <SetupGuideBanner /> : null}

            {numbers.length === 0 ? (
                <EmptyState
                    icon={<PhoneIcon />}
                    title="No phone numbers yet"
                    description="Bring a phone number you already have with Telnyx or Twilio (US and international) or VoiceLink (India). Connecting it changes nothing: calls keep ringing the way they do now until you choose what the AI does with the number."
                    classNames={{ content: 'flex-row flex-wrap justify-center gap-2' }}
                >
                    <Button onClick={() => setConnectOpen(true)}>
                        <Plus className="size-4" />
                        Connect a number
                    </Button>
                    <SetupGuideButton />
                </EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground max-w-3xl text-sm">
                            Each number does one job: the AI answers its calls, or the AI makes calls from it. Until you pick
                            one, calls ring the way they always have.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <SetupGuideButton />
                            <Button onClick={() => setConnectOpen(true)}>
                                <Plus className="size-4" />
                                Connect a number
                            </Button>
                        </div>
                    </div>
                    <ul className="bg-card divide-y rounded-lg border" aria-label="Your phone numbers">
                        {numbers.map((number) => (
                            <PhoneNumberRow key={number._id} number={number} />
                        ))}
                    </ul>
                    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                        Call recordings stay in your Telnyx, Twilio or VoiceLink account. We only keep a link to each one,
                        never the audio.
                    </p>
                </>
            )}

            <ConnectNumberDialog />
            <NumberJobDialog />
            <NumberTestCallDialog />
            <RemoveNumberDialog />
            <SetupGuideDialog />
        </>
    );
}
