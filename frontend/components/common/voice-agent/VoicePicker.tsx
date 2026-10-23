'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Check, Pause, Play, Search } from 'lucide-react';
import { VoiceKeyProvider, type VoiceAgentVoice, type VoiceTtsVoice } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { VoiceOption } from '@/helpers/voice-catalogue';
import { VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';
import { cn } from '@/lib/utils';
import { ProviderLogo } from './ProviderLogo';
import { SortButton, type ListSort } from './SortButton';

type VoicePickerProps = {
    id?: string;
    /** Whose voices it speaks in: Gemini (Gemini Live, or a Gemini text-to-speech step) or the TTS step's provider. */
    provider: VoiceKeyProvider;
    /** That provider's voices (loaded with the page). */
    voices: VoiceOption[];
    disabled?: boolean;
};

type Gender = 'any' | 'female' | 'male' | 'neutral';

const ANY = 'any';

const sameVoice = (a: VoiceTtsVoice | null, b: VoiceTtsVoice | null) =>
    !!a && !!b && a.provider === b.provider && a.voiceId === b.voiceId;

/**
 * The agent's voice: a button with the current one that opens a picker of `provider`'s voices, with
 * filters, search, an order and samples. Bound to the surrounding form's `voice` (Gemini's voices) or
 * `ttsVoice` (another provider's). Every voice of one provider costs the same: "cheapest first" keeps the
 * provider's own order, built-in voices first.
 */
export function VoicePicker({ id, provider, voices, disabled }: VoicePickerProps) {
    const form = useFormContext<{ voice: VoiceAgentVoice; ttsVoice?: VoiceTtsVoice | null }>();
    const gemini = provider === VoiceKeyProvider.GEMINI;
    const voice = form.watch('voice');
    const ttsVoice = form.watch('ttsVoice') ?? null;
    const current: VoiceTtsVoice | null = gemini
        ? { provider, voiceId: voice, name: voices.find((v) => v.voiceId === voice)?.name ?? voice }
        : ttsVoice?.provider === provider
          ? ttsVoice
          : null;

    const [open, setOpen] = useState(false);
    const [gender, setGender] = useState<Gender>(ANY);
    const [accent, setAccent] = useState(ANY);
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<ListSort>('price');
    const [pick, setPick] = useState<VoiceTtsVoice | null>(null);

    const openPicker = () => {
        setPick(current);
        setGender(ANY);
        setAccent(ANY);
        setQuery('');
        setOpen(true);
    };

    const accents = [...new Set(voices.map((v) => v.accent).filter((a): a is string => !!a))].sort();
    const q = query.trim().toLowerCase();
    const shown = voices.filter(
        (v) =>
            (gender === ANY || v.gender === gender) &&
            (accent === ANY || v.accent === accent) &&
            (!q || `${v.name} ${v.description ?? ''} ${v.voiceId}`.toLowerCase().includes(q)),
    );
    if (sort === 'name') shown.sort((a, b) => a.name.localeCompare(b.name));

    const save = () => {
        if (!pick) return;
        if (gemini) form.setValue('voice', pick.voiceId as VoiceAgentVoice, { shouldDirty: true });
        else form.setValue('ttsVoice', pick, { shouldDirty: true });
        setOpen(false);
    };

    const name = VOICE_KEY_PROVIDERS[provider].name;

    return (
        <>
            <Button
                type="button"
                id={id}
                variant="outline"
                className="w-full justify-between font-normal"
                onClick={openPicker}
                disabled={disabled}
                data-testid="voice-picker-trigger"
            >
                <span className="truncate">{current?.name ?? 'Pick a voice'}</span>
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <ProviderLogo provider={provider} className="size-4" />
                    {name}
                </span>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-4xl" data-testid="voice-picker">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ProviderLogo provider={provider} />
                            Pick a voice
                        </DialogTitle>
                        <DialogDescription>
                            {name}&rsquo;s voices{gemini ? '' : ', with the ones in your own account'}. To speak through
                            another provider, change the model in Agent stack.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]">
                        <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                            <SelectTrigger aria-label="Gender" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ANY}>Any gender</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="neutral">Neutral</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={accent} onValueChange={setAccent}>
                            <SelectTrigger aria-label="Accent" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ANY}>Any accent</SelectItem>
                                {accents.map((a) => (
                                    <SelectItem key={a} value={a}>
                                        {a}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="relative">
                            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search voices"
                                aria-label="Search voices"
                                className="pl-8"
                            />
                        </div>
                        <SortButton value={sort} onChange={setSort} />
                    </div>
                    <div className="-mx-1 min-h-40 overflow-y-auto px-1">
                        {shown.length ? (
                            <VoiceGrid voices={shown} pick={pick} onPick={setPick} />
                        ) : (
                            <Empty>
                                <EmptyDescription>
                                    {voices.length
                                        ? 'No voice matches.'
                                        : `Add your ${name} key in Settings to see its voices.`}
                                </EmptyDescription>
                            </Empty>
                        )}
                    </div>
                    <DialogFooter className="items-center sm:justify-between">
                        <p className="text-sm" data-testid="voice-picker-selection">
                            {pick ? (
                                <>
                                    <span className="font-medium">{pick.name}</span>{' '}
                                    <span className="text-muted-foreground">· {name}</span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">No voice picked</span>
                            )}
                        </p>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={save} disabled={!pick || sameVoice(pick, current)}>
                                Save
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** Voice cards; `onPick` absent = shown to listen to, not to pick. One sample plays at a time. */
function VoiceGrid({
    voices,
    pick,
    onPick,
}: {
    voices: VoiceOption[];
    pick: VoiceTtsVoice | null;
    onPick?: (voice: VoiceTtsVoice) => void;
}) {
    const audio = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState<string | null>(null);
    useEffect(() => () => audio.current?.pause(), []);

    const toggle = (voice: VoiceOption) => {
        audio.current?.pause();
        if (playing === voice.voiceId || !voice.previewUrl) {
            setPlaying(null);
            return;
        }
        const el = new Audio(voice.previewUrl);
        el.onended = () => setPlaying(null);
        audio.current = el;
        setPlaying(voice.voiceId);
        void el.play().catch(() => setPlaying(null));
    };

    return (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Voices">
            {voices.map((voice) => {
                const selected = sameVoice(voice, pick);
                const traits = [voice.accent, voice.gender && voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <li
                        key={voice.voiceId}
                        className={cn(
                            'flex items-center gap-3 rounded-md border p-3',
                            selected && 'border-primary bg-primary/5',
                            !onPick && 'opacity-70',
                        )}
                        data-testid="voice-option"
                    >
                        <button
                            type="button"
                            className="grid min-w-0 flex-1 gap-0.5 text-left disabled:cursor-default"
                            onClick={() => onPick?.({ provider: voice.provider, voiceId: voice.voiceId, name: voice.name })}
                            disabled={!onPick}
                            aria-pressed={selected}
                        >
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                                {voice.name}
                                {selected ? <Check className="text-primary size-4" aria-label="Picked" /> : null}
                            </span>
                            {traits ? <span className="text-muted-foreground text-xs">{traits}</span> : null}
                            {voice.description ? (
                                <span className="text-muted-foreground truncate text-xs">{voice.description}</span>
                            ) : null}
                        </button>
                        {voice.previewUrl ? (
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="size-8 shrink-0"
                                onClick={() => toggle(voice)}
                                aria-label={playing === voice.voiceId ? `Stop ${voice.name}` : `Play ${voice.name}`}
                            >
                                {playing === voice.voiceId ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </Button>
                        ) : (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                                No sample
                            </Badge>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
