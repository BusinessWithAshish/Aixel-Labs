'use client';

import { useState } from 'react';
import { Copy, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { VOICE_AGENT_LIMITS } from '@aixellabs/backend/db/types';
import { duplicateVoiceAgent } from '@/app/actions/voice-agent-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItems, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { usePage } from '@/contexts/PageStore';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** The agent's less used actions, out of the header's way: a copy of it, and deleting it. */
export function AgentMoreMenu() {
    const { agentId, saved, setDeleteOpen } = usePage<UseVoiceAgentEditorPageReturn>();
    const router = useProgressRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const start = () => {
        setName(`${saved.name} (copy)`.slice(0, VOICE_AGENT_LIMITS.nameMax));
        setOpen(true);
    };

    const duplicate = async () => {
        setBusy(true);
        const res = await duplicateVoiceAgent(agentId, { name });
        if (!res.success || !res.data?._id) {
            setBusy(false);
            return void toast.error(res.error ?? 'Could not copy the agent');
        }
        toast.success(`${res.data.name} created`);
        router.push(voiceAgentUrl(res.data._id));
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="size-8" aria-label="More actions">
                        <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItems
                        options={[
                            { key: 'duplicate', label: 'Duplicate', icon: Copy, onSelect: start },
                            { type: 'separator' },
                            {
                                key: 'delete',
                                label: 'Delete agent',
                                icon: Trash2,
                                variant: 'destructive',
                                onSelect: () => setDeleteOpen(true),
                            },
                        ]}
                    />
                </DropdownMenuContent>
            </DropdownMenu>
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
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={() => void duplicate()} disabled={busy || !name.trim()}>
                            {busy ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                            ) : (
                                <Copy className="size-4" aria-hidden />
                            )}
                            Duplicate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
