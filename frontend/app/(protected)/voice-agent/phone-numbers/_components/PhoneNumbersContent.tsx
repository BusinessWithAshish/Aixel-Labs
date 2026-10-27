'use client';

import { ChevronDown, Info, MessageCircleMore, PhoneIcon, Plus } from 'lucide-react';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import { numberInScope } from '@/helpers/voice-agent-channels';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItems, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/EmptyState';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { TestCallDialog } from '@/components/common/voice-agent/TestCallDialog';
import { usePage } from '@/contexts/PageStore';
import { NUMBER_PROVIDER_ORDER, numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { setupGuideFor } from '../_utils/setup-guides';
import { ConnectNumberDialog } from './ConnectNumberDialog';
import { PhoneNumberRow } from './PhoneNumberRow';
import { SetupGuideDialog } from '@/components/common/voice-agent/SetupGuideDialog';
import { RemoveNumberDialog } from './RemoveNumberDialog';

/** Picks the provider, then opens its connect dialog (its setup guide is one click from there). */
function ConnectNumberMenu() {
    const { openConnect, scope } = usePage<UsePhoneNumbersPageReturn>();
    if (scope === 'whatsapp') {
        return (
            <Button onClick={() => openConnect(VoiceProvider.WHATSAPP)}>
                <Plus className="size-4" aria-hidden />
                Connect a WhatsApp number
            </Button>
        );
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button>
                    <Plus className="size-4" aria-hidden />
                    Connect a number
                    <ChevronDown className="size-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItems
                    options={NUMBER_PROVIDER_ORDER.filter((provider) => numberInScope(provider, 'phone')).map((provider) => {
                        const { label, region } = numberProviderInfo(provider);
                        return {
                            key: provider,
                            icon: <NumberProviderLogo provider={provider} />,
                            label: (
                                <span className="grid">
                                    {label}
                                    <span className="text-muted-foreground text-xs">{region}</span>
                                </span>
                            ),
                            onSelect: () => openConnect(provider),
                        };
                    })}
                />
            </DropdownMenuContent>
        </DropdownMenu>
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

function ProviderSetupGuide() {
    const { setupGuide, closeSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    return (
        <SetupGuideDialog
            guide={setupGuideFor(setupGuide.provider)}
            open={setupGuide.open}
            initialStepId={setupGuide.stepId}
            onOpenChange={(open) => !open && closeSetupGuide()}
        />
    );
}

const SCOPE_WORDS = {
    phone: {
        emptyTitle: 'No phone numbers yet',
        emptyText: 'Bring a number you already have with Telnyx, Twilio or VoiceLink. Nothing changes until an agent uses it.',
        lead: 'Link a number to an agent from the agent’s page. Until then, its calls ring the way they always have.',
        listLabel: 'Your phone numbers',
        keyAction: 'answer or make calls',
    },
    whatsapp: {
        emptyTitle: 'No WhatsApp numbers yet',
        emptyText:
            'Connect your WhatsApp Business number through your own Meta app (no business number yet? Meta gives every app a free test number). Its agent then answers chats, voice notes and calls.',
        lead: 'Link a number to a WhatsApp agent from the agent’s page. Its chats show up in the Inbox.',
        listLabel: 'Your WhatsApp numbers',
        keyAction: 'answer chats and calls',
    },
};

export function PhoneNumbersContent() {
    const { numbers, loadError, geminiKey, scope } = usePage<UsePhoneNumbersPageReturn>();
    const words = SCOPE_WORDS[scope];

    return (
        <>
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            <GeminiKeyNotice view={geminiKey} action={words.keyAction} />

            {numbers.length === 0 ? (
                <EmptyState
                    icon={scope === 'whatsapp' ? <MessageCircleMore /> : <PhoneIcon />}
                    title={words.emptyTitle}
                    description={words.emptyText}
                >
                    <ConnectNumberMenu />
                </EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground max-w-3xl text-sm">{words.lead}</p>
                        <ConnectNumberMenu />
                    </div>
                    <ul className="bg-card divide-y rounded-lg border" aria-label={words.listLabel}>
                        {numbers.map((number) => (
                            <PhoneNumberRow key={number._id} number={number} />
                        ))}
                    </ul>
                    {scope === 'phone' ? (
                        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                            Call recordings stay in your Telnyx, Twilio or VoiceLink account. We only keep a link to each one,
                            never the audio.
                        </p>
                    ) : null}
                </>
            )}

            <ConnectNumberDialog />
            <NumberTestCallDialog />
            <RemoveNumberDialog />
            <ProviderSetupGuide />
        </>
    );
}
