'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import type { PromptTool } from '../../_utils/prompt-tools';
import { ToolSummary } from './ToolSummary';

type ToolRowProps = {
    tool: PromptTool;
    /** The row's and its switch's ids, for "Go to Tools" in the prompt editor. */
    id?: string;
    switchId?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCheckedChange: (on: boolean) => void;
    switchDisabled?: boolean;
    badges?: ReactNode;
    /** Its settings, shown while it is open. */
    children: ReactNode;
    'data-testid'?: string;
};

/** One tool in the Tools card's list: name and what it does (click to open its settings), and its on/off switch. */
export function ToolRow({
    tool,
    id,
    switchId,
    open,
    onOpenChange,
    onCheckedChange,
    switchDisabled,
    badges,
    children,
    ...props
}: ToolRowProps) {
    return (
        <li id={id} className="scroll-mt-4" data-testid={props['data-testid']} data-tool={tool.name}>
            <Collapsible open={open} onOpenChange={onOpenChange}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                    <CollapsibleTrigger className="group/tool hover:bg-muted/60 -my-1 -ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 text-left">
                        <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]/tool:rotate-90" />
                        <ToolSummary tool={tool} badges={badges} />
                    </CollapsibleTrigger>
                    <Switch
                        id={switchId}
                        checked={tool.on}
                        onCheckedChange={onCheckedChange}
                        disabled={switchDisabled}
                        aria-label={`Use ${tool.name}`}
                    />
                </div>
                <CollapsibleContent className="bg-muted/30 grid grid-cols-[minmax(0,1fr)] gap-4 border-t px-3 py-4">
                    {children}
                </CollapsibleContent>
            </Collapsible>
        </li>
    );
}
