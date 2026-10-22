'use client';

import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    VOICE_AGENT_CALL_TYPES,
    VOICE_AGENT_PROMPT_TEMPLATES,
    type VoiceAgentPromptTemplate,
} from '@/helpers/voice-agent-defaults';
import { cn } from '@/lib/utils';

type PromptTemplatesProps = {
    /** The agent's type on screen: its templates come first. */
    callType: VoiceAgentCallType;
    /** An empty prompt shows its type's templates as cards; else a button opens the picker. */
    empty: boolean;
    onUse: (template: VoiceAgentPromptTemplate) => void;
};

/** The call types, the agent's own first: the picker's groups. */
function groupsFor(callType: VoiceAgentCallType): VoiceAgentCallType[] {
    const other = callType === VoiceAgentCallType.INBOUND ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND;
    return [callType, other];
}

const ofType = (callType: VoiceAgentCallType) => VOICE_AGENT_PROMPT_TEMPLATES.filter((t) => t.callType === callType);

/**
 * Templates for the prompt: picked from a list grouped by call type, read in full before using one.
 * Using one replaces the prompt; the editor keeps what was there to switch back to.
 */
export function PromptTemplates({ callType, empty, onUse }: PromptTemplatesProps) {
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<VoiceAgentPromptTemplate>(ofType(callType)[0]);

    const preview = (template: VoiceAgentPromptTemplate) => {
        setPicked(template);
        setOpen(true);
    };

    return (
        <>
            {empty ? (
                <div className="grid gap-2 rounded-md border border-dashed p-3" data-testid="prompt-templates">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Start from a template, or write your own below</p>
                        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setOpen(true)}>
                            All templates
                        </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {ofType(callType).map((template) => (
                            <Button
                                key={template.id}
                                type="button"
                                variant="outline"
                                className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal"
                                onClick={() => preview(template)}
                            >
                                <span className="text-sm font-medium">{template.title}</span>
                                <span className="text-muted-foreground text-xs font-normal">{template.description}</span>
                            </Button>
                        ))}
                    </div>
                </div>
            ) : (
                <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setOpen(true)}>
                    <LayoutTemplate className="size-3.5" />
                    Templates
                </Button>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-h-[85dvh] sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Templates</DialogTitle>
                        <DialogDescription>
                            Using one replaces the prompt. You can switch back to yours until you leave the page.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid min-h-0 gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                        <div
                            className="grid max-h-44 content-start gap-3 overflow-y-auto sm:max-h-none"
                            data-testid="template-list"
                        >
                            {groupsFor(callType).map((group) => (
                                <div key={group} className="grid gap-1">
                                    <p className="text-muted-foreground px-2 text-xs font-medium">
                                        {VOICE_AGENT_CALL_TYPES[group].label} · {VOICE_AGENT_CALL_TYPES[group].short}
                                    </p>
                                    {ofType(group).map((template) => (
                                        <Button
                                            key={template.id}
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-pressed={picked.id === template.id}
                                            className={cn('justify-start', picked.id === template.id && 'bg-accent')}
                                            onClick={() => setPicked(template)}
                                        >
                                            {template.title}
                                        </Button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                            <p className="text-muted-foreground text-sm">{picked.description}</p>
                            <pre
                                className="bg-muted/40 max-h-[45dvh] overflow-y-auto rounded-md border p-3 font-sans text-xs whitespace-pre-wrap sm:max-h-none"
                                data-testid="template-preview"
                            >
                                {picked.prompt}
                            </pre>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                onUse(picked);
                                setOpen(false);
                            }}
                        >
                            Use {picked.title}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
