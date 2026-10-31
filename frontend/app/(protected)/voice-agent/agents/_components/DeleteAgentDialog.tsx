'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteAgentDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    name: string;
    /** Whether it answers or places calls on any number (those are let go with it). */
    onNumbers: boolean;
    onConfirm: () => void;
    deleting: boolean;
};

/** "Delete {name}?", the same from the agents list and from the agent's own page. */
export function DeleteAgentDialog({ open, onOpenChange, name, onNumbers, onConfirm, deleting }: DeleteAgentDialogProps) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Delete ${name}?`}
            alertMessage={
                onNumbers
                    ? 'The agent is removed and its numbers are let go: they stop answering or calling with it until you pick another agent. Past call logs stay.'
                    : 'The agent is removed. Past call logs stay.'
            }
            confirmText="Delete agent"
            onConfirm={onConfirm}
            isLoading={deleting}
        />
    );
}
