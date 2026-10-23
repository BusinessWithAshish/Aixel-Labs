'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { CardSaveActions } from '../CardSaveActions';
import { BookingToolRows } from './BookingToolRows';
import { CustomToolRows } from './CustomToolRows';

/** The Tools card's id, for scrolling to it. */
export const VOICE_AGENT_TOOLS_ID = 'voice-agent-tools';

/**
 * What the agent can do during a call, beyond talking: the built-in booking tools, then the owner's own.
 * One tool's settings are open at a time. Read by the engine at the start of every call.
 */
export function VoiceAgentToolsCard() {
    const { bookingDirty, bookingError, savingBooking, saveBooking, discardBooking, justConnected } =
        usePage<UseVoiceAgentEditorPageReturn>();
    // Back from connecting an app: where bookings go is open, showing it.
    const [open, setOpen] = useState<string | null>(justConnected ? 'check_availability' : null);

    return (
        <Card id={VOICE_AGENT_TOOLS_ID} className="h-auto min-w-0 scroll-mt-4" data-testid="voice-agent-tools">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    Tools
                    {bookingDirty ? (
                        <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Unsaved changes</span>
                    ) : null}
                </CardTitle>
                <CardDescription>
                    Things the agent can do during a call. Open a tool for its settings. Changes apply from the next call.
                </CardDescription>
                {/* The built-in tools save here; custom tools save as soon as they change. */}
                <CardSaveActions
                    dirty={bookingDirty}
                    error={bookingError}
                    saving={savingBooking}
                    onDiscard={discardBooking}
                    onSave={saveBooking}
                    saveLabel="Save tools"
                    errorTestId="booking-error"
                />
            </CardHeader>
            <CardContent>
                <ul className="divide-y rounded-md border" data-testid="tool-list">
                    <BookingToolRows open={open} onOpen={setOpen} />
                    <CustomToolRows open={open} onOpen={setOpen} />
                </ul>
            </CardContent>
        </Card>
    );
}
