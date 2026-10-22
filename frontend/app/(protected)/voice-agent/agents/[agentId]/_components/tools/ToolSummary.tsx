import type { ReactNode } from 'react';
import type { PromptTool } from '../../_utils/prompt-tools';

/** A tool as the agent gets it: the name the prompt (and "/") uses, what it does, and what it reads, writes or calls. */
export function ToolSummary({ tool, badges }: { tool: PromptTool; badges?: ReactNode }) {
    return (
        <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <code className="truncate font-mono text-sm font-medium">{tool.name}</code>
                {badges}
            </p>
            <p className="truncate text-sm">{tool.description}</p>
            <p className="text-muted-foreground truncate text-xs" data-testid="tool-where">
                {tool.where}
            </p>
        </div>
    );
}
