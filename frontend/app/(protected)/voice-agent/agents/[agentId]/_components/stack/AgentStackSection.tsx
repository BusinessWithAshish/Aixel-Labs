'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useFormContext } from 'react-hook-form';
import { Info } from 'lucide-react';
import { VOICE_DEFAULT_STACK, VoiceStackKind, type VoiceStack } from '@aixellabs/backend/db/types';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import {
    conversationUsdPerMinute,
    defaultStack,
    PIPELINE_PARTS,
    stackModel,
    stackUsdPerMinute,
} from '@/helpers/voice-stack';
import type { VoiceAgentInput } from '@/helpers/voice-schemas';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { fitTtsVoice, StackStep } from './StackStep';

/**
 * This agent's stack: one voice model (realtime: it hears and answers out loud), or three steps (speech
 * to text, a text model, text to speech), each with its model, the key it runs on and, where it speaks,
 * the voice. Part of the agent form: saved with the agent card.
 */
export function AgentStackSection() {
    const { stackOptions } = usePage<UseVoiceAgentEditorPageReturn>();
    const form = useFormContext<VoiceAgentInput>();
    const stack = (form.watch('stack') ?? VOICE_DEFAULT_STACK) as VoiceStack<string>;
    const currency = useDisplayCurrency();
    const perMin = (usd: number) => `${formatMoney(usd, currency)}/min`;

    // Switching back finds the other kind as it was left.
    const other = useRef<Partial<Record<VoiceStackKind, VoiceStack<string>>>>({});
    const setKind = (kind: VoiceStackKind) => {
        if (kind === stack.kind) return;
        other.current[stack.kind] = stack;
        const next = other.current[kind] ?? defaultStack(kind);
        form.setValue('stack', next, { shouldDirty: true });
        if (next.kind === VoiceStackKind.PIPELINE) fitTtsVoice(form, stackOptions.voices, next.tts);
    };

    const { catalogue } = stackOptions;
    // A live model's from-price includes re-reading the conversation, as its bill does.
    const cheapest = (kind: VoiceStackKind) => {
        const stack = defaultStack(kind);
        return (
            stackUsdPerMinute(stack, catalogue) +
            (stack.kind === VoiceStackKind.REALTIME
                ? conversationUsdPerMinute(stackModel('realtime', stack.model, catalogue))
                : 0)
        );
    };
    const options: RadioCardOption<VoiceStackKind>[] = [
        {
            value: VoiceStackKind.REALTIME,
            title: 'One voice model',
            description: `A live voice model hears the caller and answers out loud. Fastest replies (about 1 s). From ${perMin(cheapest(VoiceStackKind.REALTIME))}.`,
        },
        {
            value: VoiceStackKind.PIPELINE,
            title: (
                <>
                    Three steps <Badge variant="outline">Beta</Badge>
                </>
            ),
            description: `Speech to text, then a text model, then a voice, each from the provider you pick. 0.2 to 0.5 s slower a reply. From ${perMin(cheapest(VoiceStackKind.PIPELINE))}.`,
        },
    ];

    return (
        <section className="grid gap-3" aria-labelledby="agent-stack-title" data-testid="agent-stack">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-0.5">
                    <h3 id="agent-stack-title" className="text-sm font-medium">
                        Agent stack
                    </h3>
                    <p className="text-muted-foreground text-xs">
                        How this agent hears, thinks and speaks. Only this agent; your API keys are in{' '}
                        <Link href={GEMINI_KEY_URL} className="text-primary underline-offset-4 hover:underline">
                            Settings
                        </Link>
                        .
                    </p>
                </div>
            </div>
            <RadioCards value={stack.kind} onValueChange={setKind} options={options} aria-label="Agent stack" />
            {stack.kind === VoiceStackKind.REALTIME ? (
                <StackStep part="realtime" stack={stack} />
            ) : (
                // One after another, a numbered stepper: each step hands its words to the next.
                <ol className="grid" aria-label="Steps" data-testid="agent-stack-steps">
                    {PIPELINE_PARTS.map((part, i) => {
                        const last = i === PIPELINE_PARTS.length - 1;
                        return (
                            <li key={part} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                                <div className="flex flex-col items-center" aria-hidden>
                                    <span className="bg-primary text-primary-foreground mt-3 grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium">
                                        {i + 1}
                                    </span>
                                    {last ? null : <span className="bg-primary/30 w-px flex-1" />}
                                </div>
                                <StackStep part={part} stack={stack} className={last ? undefined : 'mb-3'} />
                            </li>
                        );
                    })}
                </ol>
            )}
            {stack.kind === VoiceStackKind.PIPELINE ? (
                <Alert variant="info" data-testid="agent-stack-beta">
                    <Info className="size-4" aria-hidden />
                    <AlertDescription>
                        Three steps is in beta: talk to the agent in the playground before it takes real calls.
                    </AlertDescription>
                </Alert>
            ) : null}
        </section>
    );
}
