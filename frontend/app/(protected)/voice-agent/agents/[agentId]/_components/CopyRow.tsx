'use client';

import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

async function copy(value: string, what: string) {
    try {
        await navigator.clipboard.writeText(value);
        toast.success(`${what} copied`);
    } catch {
        toast.error(`Could not copy the ${what.toLowerCase()}`);
    }
}

/** A value to copy (a username, a SIP address, a setup link), with its label above. */
export function CopyRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
    return (
        <div className="bg-background flex min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-xs">{label}</span>
                <span className="font-mono text-sm break-all" data-testid={testId}>
                    {value}
                </span>
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Copy ${label.toLowerCase()}`}
                onClick={() => void copy(value, label)}
            >
                <Copy className="size-4" />
            </Button>
        </div>
    );
}
