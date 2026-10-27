'use client';

import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType, VoiceAgentChannel } from '@aixellabs/backend/db/types';
import { duplicateVoiceAgent } from '@/app/actions/voice-agent-actions';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePage } from '@/contexts/PageStore';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { CHANNEL_WORDS, channelOf } from '@/helpers/voice-agent-channels';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** A copy of the saved agent (prompt, voice, tools, settings), for another channel: a WhatsApp twin of a phone agent. */
export function DuplicateAgentButton() {
    const { agentId, saved } = usePage<UseVoiceAgentEditorPageReturn>();
    const router = useProgressRouter();
    const places = saved.callType === VoiceAgentCallType.OUTBOUND;
    const other = channelOf(saved) === VoiceAgentChannel.PHONE && !places ? VoiceAgentChannel.WHATSAPP : VoiceAgentChannel.PHONE;
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [channel, setChannel] = useState<VoiceAgentChannel>(other);
    const [busy, setBusy] = useState(false);

    const start = () => {
        setChannel(other);
        setName(`${saved.name} (${CHANNEL_WORDS[other].title})`.slice(0, VOICE_AGENT_LIMITS.nameMax));
        setOpen(true);
    };

    const duplicate = async () => {
        setBusy(true);
        const res = await duplicateVoiceAgent(agentId, { name, channel });
        if (!res.success || !res.data?._id) {
            setBusy(false);
            return void toast.error(res.error ?? 'Could not copy the agent');
        }
        toast.success(`${res.data.name} created`);
        router.push(voiceAgentUrl(res.data._id));
    };

    const options = (places ? [VoiceAgentChannel.PHONE] : Object.values(VoiceAgentChannel)).map((value) => ({
        value,
        ...CHANNEL_WORDS[value],
    }));

    return (
        <>
            <Button type="button" variant="outline" size="sm" onClick={start}>
                <Copy className="size-4" aria-hidden />
                Duplicate
            </Button>
            <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Duplicate {saved.name}</DialogTitle>
                        <DialogDescription>
                            The copy gets its prompt, voice, tools and settings (saved ones), but no numbers and no memories.
                        </DialogDescription>
                    </DialogHeader>
                    <Field>
                        <FieldLabel htmlFor="duplicate-name">Name</FieldLabel>
                        <Input
                            id="duplicate-name"
                            value={name}
                            maxLength={VOICE_AGENT_LIMITS.nameMax}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel id="duplicate-channel-label">Where the copy works</FieldLabel>
                        <RadioCards
                            value={channel}
                            onValueChange={setChannel}
                            options={options}
                            aria-labelledby="duplicate-channel-label"
                            className="sm:grid-cols-1"
                        />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void duplicate()} disabled={busy || !name.trim()}>
                            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                            Duplicate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
