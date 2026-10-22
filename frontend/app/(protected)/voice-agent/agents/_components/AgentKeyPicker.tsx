'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { VoiceKeyProvider, VoiceStackKind, type VoiceGeminiKeyView, type VoiceStack } from '@aixellabs/backend/db/types';
import {
    clearAgentStack,
    getAgentStack,
    setAgentGeminiKey,
    type VoiceAgentStackChoice,
} from '@/app/actions/voice-settings-actions';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { GeminiKeyLine } from './GeminiKeyLine';

const DEFAULT_KEY = 'default';

/** The Gemini key id an agent's own stack names, if any. */
function ownKeyId(stack: VoiceStack<string> | null): string | null {
    if (!stack) return null;
    const part = stack.kind === VoiceStackKind.REALTIME ? stack : stack.llm;
    return part.provider === VoiceKeyProvider.GEMINI ? (part.keyId ?? null) : null;
}

/**
 * Which of the owner's Gemini keys one agent runs on (the default unless picked), with how that key is
 * doing. Saved as soon as it changes, like a number's agent.
 */
export function AgentKeyPicker({ agentId, view }: { agentId: string; view: VoiceGeminiKeyView }) {
    const router = useRouter();
    const [choice, setChoice] = useState<VoiceAgentStackChoice | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let live = true;
        void getAgentStack(agentId).then((res) => live && res.success && res.data && setChoice(res.data));
        return () => {
            live = false;
        };
    }, [agentId]);

    const run = async (action: () => ReturnType<typeof getAgentStack>, done: string) => {
        setSaving(true);
        const res = await action();
        setSaving(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not change the key');
            return;
        }
        setChoice(res.data);
        toast.success(done);
        router.refresh(); // the key line here and in the playground
    };

    const keys = choice?.geminiKeys ?? [];
    const value = ownKeyId(choice?.own ?? null) ?? DEFAULT_KEY;

    return (
        <Field>
            <div className="flex items-end justify-between gap-2">
                <FieldLabel htmlFor="agent-gemini-key">Gemini key</FieldLabel>
                {choice?.own ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={saving}
                        onClick={() => void run(() => clearAgentStack(agentId), 'Back on the stack and key from Settings')}
                    >
                        Use Settings
                    </Button>
                ) : (
                    <Button variant="ghost" size="sm" className="h-7" asChild>
                        <Link href={GEMINI_KEY_URL}>Manage keys</Link>
                    </Button>
                )}
            </div>
            {keys.length > 1 ? (
                <Select
                    value={value}
                    onValueChange={(v) =>
                        void run(() => setAgentGeminiKey(agentId, v === DEFAULT_KEY ? null : v), 'Key saved for this agent')
                    }
                    disabled={saving}
                >
                    <SelectTrigger id="agent-gemini-key" className="w-full" data-testid="agent-key-select">
                        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={DEFAULT_KEY}>Default ({keys[0].label})</SelectItem>
                        {keys.map((key) => (
                            <SelectItem key={key._id} value={key._id}>
                                {key.label} · ending {key.last4}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : null}
            <GeminiKeyLine view={view} className="min-h-9" />
        </Field>
    );
}
