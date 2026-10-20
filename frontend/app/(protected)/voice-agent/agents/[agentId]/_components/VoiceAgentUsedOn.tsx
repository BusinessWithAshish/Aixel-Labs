'use client';

import Link from 'next/link';
import { ArrowRight, PhoneIncoming, PhoneOutgoing, type LucideIcon } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceAgentNumberUse } from '@/app/actions/voice-agent-actions';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** "1 number still places" / "2 numbers still place". */
function numbersStill(count: number, verb: string): string {
    return count === 1 ? `1 number still ${verb}s` : `${count} numbers still ${verb}`;
}

type UsageGroupProps = {
    title: string;
    icon: LucideIcon;
    numbers: VoiceAgentNumberUse[];
    testId: string;
};

function UsageGroup({ title, icon: Icon, numbers, testId }: UsageGroupProps) {
    return (
        <div className="grid content-start gap-1.5" data-testid={testId}>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" />
                {title}
            </p>
            {numbers.length === 0 ? (
                <p className="text-muted-foreground text-sm">None</p>
            ) : (
                <ul className="grid gap-1">
                    {numbers.map((number) => (
                        <li key={number.id} className="text-sm font-medium tabular-nums">
                            {number.phoneNumber}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/** The user's numbers that send incoming calls to this agent, and those that place calls with it. */
export function VoiceAgentUsedOn({ className }: { className?: string }) {
    const { saved, usage } = usePage<UseVoiceAgentEditorPageReturn>();
    const used = usage.inbound.length + usage.outbound.length > 0;

    // The type is what the agent is meant for; a number can still use it the other way round.
    const mismatch =
        saved.callType === VoiceAgentCallType.INBOUND && usage.outbound.length > 0
            ? `It is an inbound agent, but ${numbersStill(usage.outbound.length, 'place')} calls with it.`
            : saved.callType === VoiceAgentCallType.OUTBOUND && usage.inbound.length > 0
              ? `It is an outbound agent, but ${numbersStill(usage.inbound.length, 'send')} incoming calls to it.`
              : null;

    return (
        <Card className={cn('h-auto min-w-0 gap-4', className)} data-testid="voice-agent-used-on">
            <CardHeader>
                <CardTitle>Used on</CardTitle>
                <CardDescription>Numbers using this agent.</CardDescription>
                <CardAction>
                    <Button variant="outline" size="sm" asChild>
                        <Link href={VOICE_PHONE_NUMBERS_URL}>
                            Phone numbers
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
                {used ? (
                    <div className="grid grid-cols-2 gap-4">
                        <UsageGroup
                            title="Incoming calls"
                            icon={PhoneIncoming}
                            numbers={usage.inbound}
                            testId="used-on-inbound"
                        />
                        <UsageGroup
                            title="Outgoing calls"
                            icon={PhoneOutgoing}
                            numbers={usage.outbound}
                            testId="used-on-outbound"
                        />
                    </div>
                ) : (
                    <p className="text-muted-foreground text-sm">
                        Not on any number yet. Pick it for a number&rsquo;s incoming or outgoing calls on the Phone Numbers
                        page.
                    </p>
                )}
                {mismatch ? <p className="text-xs text-amber-600 dark:text-amber-400">{mismatch}</p> : null}
            </CardContent>
        </Card>
    );
}
