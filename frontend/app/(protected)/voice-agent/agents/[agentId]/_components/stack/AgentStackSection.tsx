'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFormContext } from 'react-hook-form';
import { ArrowRight, Info } from 'lucide-react';
import { VOICE_DEFAULT_STACK, VoiceKeyProvider, VoiceStackKind, type VoiceStack } from '@aixellabs/backend/db/types';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { SortToggle, type ListSort } from '@/components/common/voice-agent/SortToggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { defaultStack, PIPELINE_PARTS, stackUsdPerMinute } from '@/helpers/voice-stack';
import type { VoiceAgentInput } from '@/helpers/voice-schemas';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { StackStep } from './StackStep';

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
    const [sort, setSort] = useState<ListSort>('price');

    // Switching back finds the other kind as it was left.
    const other = useRef<Partial<Record<VoiceStackKind, VoiceStack<string>>>>({});
    const setKind = (kind: VoiceStackKind) => {
        if (kind === stack.kind) return;
        other.current[stack.kind] = stack;
        const next = other.current[kind] ?? defaultStack(kind);
        form.setValue('stack', next, { shouldDirty: true });
        // Three steps speak through their voice step: its provider's first voice until one is picked.
        const tts = next.kind === VoiceStackKind.PIPELINE ? next.tts.provider : null;
        const first = tts && tts !== VoiceKeyProvider.GEMINI ? stackOptions.voices[tts]?.[0] : null;
        if (first && form.getValues('ttsVoice')?.provider !== tts) {
            form.setValue(
                'ttsVoice',
                { provider: first.provider, voiceId: first.voiceId, name: first.name },
                { shouldDirty: true },
            );
        }
    };

    const { catalogue } = stackOptions;
    const cheapest = (kind: VoiceStackKind) => stackUsdPerMinute(defaultStack(kind), catalogue);
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
                <SortToggle value={sort} onChange={setSort} />
            </div>
            <RadioCards value={stack.kind} onValueChange={setKind} options={options} aria-label="Agent stack" />
            {stack.kind === VoiceStackKind.REALTIME ? (
                <StackStep part="realtime" stack={stack} sort={sort} />
            ) : (
                <ol
                    className="grid items-stretch gap-3 2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
                    aria-label="Steps"
                >
                    {PIPELINE_PARTS.map((part, i) => (
                        <li key={part} className="contents">
                            {i ? (
                                <ArrowRight
                                    className="text-muted-foreground hidden size-4 self-center 2xl:block"
                                    aria-hidden
                                />
                            ) : null}
                            <StackStep part={part} step={i + 1} stack={stack} sort={sort} />
                        </li>
                    ))}
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
