'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Check, Loader2, Pause, Play, Search } from 'lucide-react';
import {
    VOICE_STACK_MODELS,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceAgentVoice,
    type VoiceStack,
    type VoiceTtsVoice,
} from '@aixellabs/backend/db/types';
import { getAgentStack, getVoiceCatalogue } from '@/app/actions/voice-settings-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { BUILT_IN_VOICES, mergeVoices, type VoiceOption } from '@/helpers/voice-catalogue';
import { stackModel, TTS_PROVIDERS, VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';
import { cn } from '@/lib/utils';

type VoicePickerProps = {
    id?: string;
    /** The agent being edited; none = a new agent, which starts on the owner's stack. */
    agentId?: string;
    disabled?: boolean;
};

type Tab = 'realtime' | 'tts';
type Gender = 'any' | 'female' | 'male' | 'neutral';

const ANY = 'any';

/** The voice an option stands for, as the form keeps it. */
const sameVoice = (a: VoiceTtsVoice | null, b: VoiceTtsVoice | null) =>
    !!a && !!b && a.provider === b.provider && a.voiceId === b.voiceId;

/** The text-to-speech provider of a PIPELINE stack. */
const ttsProviderOf = (stack: VoiceStack<string> | null) =>
    stack?.kind === VoiceStackKind.PIPELINE ? stack.tts.provider : null;

/**
 * The agent's voice: a button with the current one that opens a picker of every voice its stack can
 * speak in (Gemini Live's on the one-model stack, the text-to-speech provider's on a pipeline), with
 * filters, search and samples. Bound to the surrounding form's `voice` and `ttsVoice`.
 */
export function VoicePicker({ id, agentId, disabled }: VoicePickerProps) {
    const form = useFormContext<{ voice: VoiceAgentVoice; ttsVoice?: VoiceTtsVoice | null }>();
    const voice = form.watch('voice');
    const ttsVoice = form.watch('ttsVoice') ?? null;
    const currency = useDisplayCurrency();

    // Which voices it can speak in depends on its stack: the picker opens once that is known.
    const [stack, setStack] = useState<VoiceStack<string> | null>(null);
    const [stackLoaded, setStackLoaded] = useState(false);
    useEffect(() => {
        let live = true;
        void getAgentStack(agentId)
            .then((res) => live && res.success && res.data && setStack(res.data.stack))
            .finally(() => live && setStackLoaded(true));
        return () => {
            live = false;
        };
    }, [agentId]);
    const pipeline = stack?.kind === VoiceStackKind.PIPELINE;
    const ttsProvider = ttsProviderOf(stack);

    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('realtime');
    const [provider, setProvider] = useState<VoiceKeyProvider>(TTS_PROVIDERS[0]);
    const [gender, setGender] = useState<Gender>(ANY);
    const [accent, setAccent] = useState(ANY);
    const [query, setQuery] = useState('');
    const [pick, setPick] = useState<VoiceTtsVoice | null>(null);

    const [own, setOwn] = useState<Partial<Record<VoiceKeyProvider, VoiceOption[]>> | null>(null);
    const [loading, setLoading] = useState(false);

    const current: VoiceTtsVoice | null = pipeline
        ? ttsVoice
        : {
              provider: VoiceKeyProvider.GEMINI,
              voiceId: voice,
              name: BUILT_IN_VOICES.gemini.find((v) => v.voiceId === voice)?.name ?? voice,
          };

    const openPicker = () => {
        setTab(pipeline ? 'tts' : 'realtime');
        setProvider(ttsProvider ?? ttsVoice?.provider ?? TTS_PROVIDERS[0]);
        setPick(current);
        setGender(ANY);
        setAccent(ANY);
        setQuery('');
        setOpen(true);
        if (own || loading) return;
        setLoading(true);
        void getVoiceCatalogue()
            .then((res) => setOwn(res.success && res.data ? res.data : {}))
            .finally(() => setLoading(false));
    };

    const shownProvider = tab === 'realtime' ? VoiceKeyProvider.GEMINI : provider;
    const voices = useMemo(
        () => mergeVoices(BUILT_IN_VOICES[shownProvider], own?.[shownProvider] ?? []),
        [shownProvider, own],
    );
    const accents = [...new Set(voices.map((v) => v.accent).filter((a): a is string => !!a))].sort();
    const q = query.trim().toLowerCase();
    const shown = voices.filter(
        (v) =>
            (gender === ANY || v.gender === gender) &&
            (accent === ANY || v.accent === accent) &&
            (!q || `${v.name} ${v.description ?? ''} ${v.voiceId}`.toLowerCase().includes(q)),
    );

    // What this stack can speak in: Gemini's voices on one model, the TTS step's provider on a pipeline.
    const usable = tab === 'realtime' ? !pipeline : pipeline && provider === ttsProvider;
    const blocked =
        tab === 'realtime'
            ? pipeline
                ? 'This agent runs on the "Pick each step" stack: it speaks through its text-to-speech step. Gemini Live voices need the one-model stack (Settings).'
                : null
            : !pipeline
              ? 'These voices need the "Pick each step" stack (beta), which you can choose in Settings.'
              : provider !== ttsProvider
                ? `Its text-to-speech step is ${VOICE_KEY_PROVIDERS[ttsProvider!].name}. To speak in a ${VOICE_KEY_PROVIDERS[provider].name} voice, change that step in Settings.`
                : null;

    const save = () => {
        if (pick?.provider === VoiceKeyProvider.GEMINI)
            form.setValue('voice', pick.voiceId as VoiceAgentVoice, { shouldDirty: true });
        else form.setValue('ttsVoice', pick, { shouldDirty: true });
        setOpen(false);
    };

    const ratePerMin = (p: VoiceKeyProvider) => {
        const model = VOICE_STACK_MODELS.tts.find((m) => m.provider === p);
        return model ? `${formatMoney(model.usdPerMinute, currency)}/min` : null;
    };
    const realtimeRate = stack?.kind === VoiceStackKind.REALTIME ? stackModel('realtime', stack.model)?.usdPerMinute : null;

    return (
        <>
            <Button
                type="button"
                id={id}
                variant="outline"
                className="w-full justify-between font-normal"
                onClick={openPicker}
                disabled={disabled || !stackLoaded}
                data-testid="voice-picker-trigger"
            >
                <span className="truncate">{current?.name ?? 'Pick a voice'}</span>
                <span className="text-muted-foreground text-xs">
                    {current ? VOICE_KEY_PROVIDERS[current.provider].name : ''}
                </span>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-4xl" data-testid="voice-picker">
                    <DialogHeader>
                        <DialogTitle>Pick a voice</DialogTitle>
                        <DialogDescription>
                            {pipeline && ttsProvider
                                ? `This agent speaks through ${VOICE_KEY_PROVIDERS[ttsProvider].name}.`
                                : 'This agent speaks in Gemini Live’s own voices.'}
                        </DialogDescription>
                    </DialogHeader>
                    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                        <TabsList>
                            <TabsTrigger value="realtime">Gemini Live voices</TabsTrigger>
                            <TabsTrigger value="tts">Text-to-speech voices</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {tab === 'tts' ? (
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            value={provider}
                            onValueChange={(v) => v && setProvider(v as VoiceKeyProvider)}
                            className="flex-wrap justify-start"
                            aria-label="Provider"
                        >
                            {TTS_PROVIDERS.map((p) => (
                                <ToggleGroupItem key={p} value={p} className="gap-2 px-3">
                                    {VOICE_KEY_PROVIDERS[p].name}
                                    <span className="text-muted-foreground text-xs">{ratePerMin(p)}</span>
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    ) : realtimeRate ? (
                        <p className="text-muted-foreground text-xs">
                            Included in Gemini Live&rsquo;s {formatMoney(realtimeRate, currency)}/min.
                        </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr]">
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
                    </div>
                    {blocked ? (
                        <Alert>
                            <AlertDescription>{blocked}</AlertDescription>
                        </Alert>
                    ) : null}
                    <div className="-mx-1 min-h-40 overflow-y-auto px-1">
                        {loading && tab === 'tts' ? (
                            <p className="text-muted-foreground flex items-center gap-2 pb-2 text-xs">
                                <Loader2 className="size-3 animate-spin" aria-hidden />
                                Adding the voices in your own account…
                            </p>
                        ) : null}
                        {shown.length ? (
                            <VoiceGrid voices={shown} pick={pick} onPick={usable ? setPick : undefined} />
                        ) : (
                            <Empty>
                                <EmptyDescription>
                                    {voices.length
                                        ? 'No voice matches.'
                                        : 'Add your key in Settings to see this provider’s voices.'}
                                </EmptyDescription>
                            </Empty>
                        )}
                    </div>
                    <DialogFooter className="items-center sm:justify-between">
                        <p className="text-sm" data-testid="voice-picker-selection">
                            {pick ? (
                                <>
                                    <span className="font-medium">{pick.name}</span>{' '}
                                    <span className="text-muted-foreground">
                                        · {VOICE_KEY_PROVIDERS[pick.provider].name}
                                    </span>
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
