'use client';

import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const LEADS_OVERVIEW_PATH = '/lead-generation/leads';

type CreditsExhaustedDialogProps = {
    savedCount: number;
    onClose: () => void;
};

function CreditsExhaustedDialog({ savedCount, onClose }: CreditsExhaustedDialogProps) {
    const [open, setOpen] = useState(true);

    const close = () => {
        setOpen(false);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) close();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Credits exhausted</DialogTitle>
                    <DialogDescription>
                        Your credit balance is now 0. We saved {savedCount}{' '}
                        {savedCount === 1 ? 'lead' : 'leads'} from this run. Top up credits to generate more.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={close}>
                        Close
                    </Button>
                    <Button type="button" onClick={() => window.location.assign(LEADS_OVERVIEW_PATH)}>
                        View leads
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** Imperative modal so lead-gen forms do not need to mount dialog state. */
export function showCreditsExhaustedDialog(savedCount: number): void {
    if (typeof document === 'undefined') return;

    if (!host) {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    }

    const unmount = () => {
        root?.render(null);
    };

    root?.render(<CreditsExhaustedDialog savedCount={savedCount} onClose={unmount} />);
}
