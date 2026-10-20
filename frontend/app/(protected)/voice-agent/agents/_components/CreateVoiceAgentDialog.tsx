'use client';

import type { FormEvent } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { VoiceAgentCallTypeBadge } from './VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypePicker } from './VoiceAgentCallTypePicker';
import { VoiceSelect } from './VoiceSelect';

const STARTS_FROM: Record<VoiceAgentCallType, string> = {
    [VoiceAgentCallType.INBOUND]:
        'It starts with a receptionist prompt and a call-notes template for your business’s hours and services. You can change all of it next.',
    [VoiceAgentCallType.OUTBOUND]:
        'It starts with the call-tested cold-call prompt. You can change the prompt, voice and notes next.',
};

/** Two steps: inbound or outbound, then name and voice. */
export function CreateVoiceAgentDialog() {
    const {
        createOpen,
        onCreateOpenChange,
        newCallType,
        setNewCallType,
        newName,
        setNewName,
        newVoice,
        setNewVoice,
        creating,
        createAgent,
    } = usePage<UseVoiceAgentsPageReturn>();

    const nameMissing = !newName.trim();

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        void createAgent();
    };

    return (
        <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
            <DialogContent className="sm:max-w-xl">
                {newCallType === null ? (
                    <div className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>New voice agent</DialogTitle>
                            <DialogDescription id="new-agent-call-type-label">
                                What will this agent do? You can change it later.
                            </DialogDescription>
                        </DialogHeader>
                        <VoiceAgentCallTypePicker
                            value={newCallType}
                            onChange={setNewCallType}
                            labelledBy="new-agent-call-type-label"
                        />
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>New voice agent</DialogTitle>
                            <DialogDescription>{STARTS_FROM[newCallType]}</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <VoiceAgentCallTypeBadge callType={newCallType} />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7"
                                onClick={() => setNewCallType(null)}
                                disabled={creating}
                            >
                                <ArrowLeft className="size-3.5" />
                                Change type
                            </Button>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-agent-name">Name</Label>
                            <Input
                                id="new-agent-name"
                                value={newName}
                                maxLength={80}
                                onChange={(e) => setNewName(e.target.value)}
                                aria-invalid={nameMissing}
                                aria-describedby="new-agent-name-hint"
                                autoFocus
                            />
                            <p
                                id="new-agent-name-hint"
                                className={cn('text-xs', nameMissing ? 'text-destructive' : 'text-muted-foreground')}
                            >
                                {nameMissing
                                    ? 'Give the agent a name, e.g. Front desk or Sales caller.'
                                    : 'Shown in your agent list and call logs. What callers hear comes from the prompt.'}
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="new-agent-voice">Voice</Label>
                            <VoiceSelect id="new-agent-voice" value={newVoice} onChange={setNewVoice} disabled={creating} />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onCreateOpenChange(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating || nameMissing}>
                                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                                Create agent
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
