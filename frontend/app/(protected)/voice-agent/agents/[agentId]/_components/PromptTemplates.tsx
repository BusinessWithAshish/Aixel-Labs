'use client';

import { useState } from 'react';
import { ChevronDown, LayoutTemplate } from 'lucide-react';
import type { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    VOICE_AGENT_CALL_TYPES,
    VOICE_AGENT_PROMPT_TEMPLATES,
    type VoiceAgentPromptTemplate,
} from '@/helpers/voice-agent-defaults';

type PromptTemplatesProps = {
    /** The agent's type on screen: its templates come first. */
    callType: VoiceAgentCallType;
    onPick: (template: VoiceAgentPromptTemplate) => void;
};

function templatesFor(callType: VoiceAgentCallType): VoiceAgentPromptTemplate[] {
    return [...VOICE_AGENT_PROMPT_TEMPLATES].sort(
        (a, b) => Number(b.callType === callType) - Number(a.callType === callType),
    );
}

function TemplateText({ template }: { template: VoiceAgentPromptTemplate }) {
    return (
        <>
            <span className="text-sm font-medium">
                {template.title}
                <span className="text-muted-foreground font-normal">
                    {' '}
                    · for {VOICE_AGENT_CALL_TYPES[template.callType].label.toLowerCase()} agents
                </span>
            </span>
            <span className="text-muted-foreground text-xs whitespace-normal">{template.description}</span>
        </>
    );
}

/** The templates as cards, for an empty prompt: one click fills it. */
export function PromptTemplateList({ callType, onPick }: PromptTemplatesProps) {
    return (
        <div className="grid gap-2 rounded-md border border-dashed p-3" data-testid="prompt-templates">
            <p className="text-sm font-medium">Start from a template, or write your own below</p>
            <div className="grid gap-2 sm:grid-cols-2">
                {templatesFor(callType).map((template) => (
                    <Button
                        key={template.id}
                        type="button"
                        variant="outline"
                        className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                        onClick={() => onPick(template)}
                    >
                        <TemplateText template={template} />
                    </Button>
                ))}
            </div>
        </div>
    );
}

/** A menu of templates beside a prompt that has text: picking one asks before replacing it. */
export function PromptTemplateMenu({ callType, onPick }: PromptTemplatesProps) {
    const [replacing, setReplacing] = useState<VoiceAgentPromptTemplate | null>(null);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7">
                        <LayoutTemplate className="size-3.5" />
                        Templates
                        <ChevronDown className="size-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Replace the prompt with a template</DropdownMenuLabel>
                    {templatesFor(callType).map((template) => (
                        <DropdownMenuItem
                            key={template.id}
                            className="flex-col items-start gap-0.5"
                            onSelect={() => setReplacing(template)}
                        >
                            <TemplateText template={template} />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
                open={replacing !== null}
                onOpenChange={(open) => !open && setReplacing(null)}
                title={`Replace your prompt with “${replacing?.title ?? ''}”?`}
                alertMessage="What is in the prompt now is replaced (and the call notes too, unless you wrote your own). Nothing is saved until you press Save; Discard brings back your saved version."
                confirmText="Replace prompt"
                variant="default"
                onConfirm={() => {
                    if (replacing) onPick(replacing);
                    setReplacing(null);
                }}
            />
        </>
    );
}
