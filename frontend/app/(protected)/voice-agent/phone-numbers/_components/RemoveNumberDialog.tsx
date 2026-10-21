'use client';

import { VoiceProvider } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePage } from '@/contexts/PageStore';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

export function RemoveNumberDialog() {
    const { removeTarget, setRemoveTarget, removing, confirmRemove } = usePage<UsePhoneNumbersPageReturn>();

    return (
        <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && !removing && setRemoveTarget(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Remove {removeTarget?.phoneNumber}?</DialogTitle>
                    <DialogDescription>
                        {removeTarget?.provider === VoiceProvider.VOICELINK ? (
                            <>
                                {removeTarget.inboundAgentId || removeTarget.outboundAgentId
                                    ? 'The AI stops handling its calls, and calls ring the way they did before you connected it. '
                                    : ''}
                                The WebSocket bot we made for it is switched off. The number itself stays in your VoiceLink
                                account. Past call logs are kept.
                            </>
                        ) : removeTarget?.provider === VoiceProvider.TWILIO ? (
                            <>
                                {removeTarget.inboundAgentId
                                    ? 'The AI stops answering, and calls ring the way they did before you connected it (its Twilio voice settings are put back exactly). '
                                    : ''}
                                Nothing else of ours is in your Twilio account. The number itself stays there. Past call logs
                                are kept.
                            </>
                        ) : (
                            <>
                                {removeTarget?.inboundAgentId
                                    ? 'The AI stops answering, and calls ring the way they did before you connected it. '
                                    : ''}
                                The apps we made for it in your Telnyx account are deleted. The number itself stays in your
                                Telnyx account. Past call logs are kept.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={removing} onClick={() => setRemoveTarget(null)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" disabled={removing} onClick={confirmRemove}>
                        {removing ? 'Removing…' : 'Remove number'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
