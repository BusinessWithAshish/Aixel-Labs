'use client';

import type { VoiceAgentVoice } from '@aixellabs/backend/db/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICE_AGENT_VOICE_OPTIONS } from '@/helpers/voice-agent-defaults';
import { cn } from '@/lib/utils';

type VoiceSelectProps = {
    id?: string;
    value: VoiceAgentVoice;
    onChange: (voice: VoiceAgentVoice) => void;
    disabled?: boolean;
    className?: string;
};

/** Gemini Live's voices, each with the one-word character Google gives it. */
export function VoiceSelect({ id, value, onChange, disabled, className }: VoiceSelectProps) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as VoiceAgentVoice)} disabled={disabled}>
            <SelectTrigger id={id} className={cn('w-full', className)}>
                <SelectValue placeholder="Pick a voice" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {VOICE_AGENT_VOICE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        <span>{option.name}</span>
                        <span className="text-muted-foreground">· {option.character}</span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
