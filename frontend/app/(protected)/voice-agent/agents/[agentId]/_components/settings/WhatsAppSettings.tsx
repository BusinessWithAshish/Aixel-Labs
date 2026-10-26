'use client';

import { Controller } from 'react-hook-form';
import { MessageCircleMore } from 'lucide-react';
import { VOICE_CALL_RATES, VOICE_CHAT_MODELS, type VoiceChatModel } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { formatMoney } from '@/helpers/voice-call-cost';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

const MODEL_WORDS: Record<VoiceChatModel, { title: string; description: string }> = {
    'gemini-3.5-flash-lite': { title: 'Fast and cheapest', description: 'Gemini 3.5 Flash-Lite: right for most front desks.' },
    'gemini-3.5-flash': { title: 'Smarter', description: 'Gemini 3.5 Flash: for long or tricky conversations.' },
};

/** One typical reply (the prompt and the chat so far in, a short message out) at the model's list price. */
function perReplyUsd(model: VoiceChatModel): number {
    const { estimateTokens, models } = VOICE_CALL_RATES.chat;
    const rate = models[model].usdPerMillionTokens;
    return (estimateTokens.textIn * rate.textIn + estimateTokens.textOut * rate.textOut) / 1e6;
}

function SwitchRow({ id, name, label, hint }: { id: string; name: 'whatsapp.voiceReplies' | 'whatsapp.handoff'; label: string; hint: string }) {
    const { settingsForm } = usePage<UseVoiceAgentEditorPageReturn>();
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p className="text-muted-foreground text-xs">{hint}</p>
            </div>
            <Controller
                control={settingsForm.control}
                name={name}
                render={({ field }) => <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />}
            />
        </div>
    );
}

/** How the agent chats when it answers a WhatsApp number: the reply model (with its price), voice notes, hand-off. */
export function WhatsAppSettings() {
    const { settingsForm, settings } = usePage<UseVoiceAgentEditorPageReturn>();
    const currency = useDisplayCurrency();
    const options = VOICE_CHAT_MODELS.map((model) => ({
        value: model,
        title: MODEL_WORDS[model].title,
        description: `${MODEL_WORDS[model].description} About ${formatMoney(perReplyUsd(model), currency)} a reply.`,
    }));

    return (
        <SettingsSection
            icon={MessageCircleMore}
            title="WhatsApp"
            description="When this agent answers a WhatsApp number, it also answers its chats, on your Gemini key. Calls on WhatsApp work like phone calls."
            data-testid="whatsapp-settings"
        >
            <RadioCards
                value={settings.whatsapp.chatModel}
                onValueChange={(model) => settingsForm.setValue('whatsapp.chatModel', model, { shouldDirty: true })}
                options={options}
                aria-label="Chat replies run on"
            />
            <SwitchRow
                id="whatsapp-voice-replies"
                name="whatsapp.voiceReplies"
                label="Answer voice notes with a voice note"
                hint="Voice notes are heard on your own speech-to-text key (Deepgram or OpenAI if you added one, else Gemini). Off: it answers in text."
            />
            <SwitchRow
                id="whatsapp-handoff"
                name="whatsapp.handoff"
                label="Hand chats to a person when needed"
                hint="When someone asks for a human, or the agent can't help, it says a team member will reply and marks the chat Needs you in the WhatsApp inbox."
            />
        </SettingsSection>
    );
}
