'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { CardSaveActions } from '../CardSaveActions';
import { BookingToolSection } from './BookingToolSection';
import { CustomToolsSection } from './CustomToolsSection';

/** The Tools card's id, for scrolling to it. */
export const VOICE_AGENT_TOOLS_ID = 'voice-agent-tools';

/** What the agent can do during a call, beyond talking. Read by the engine at the start of every call. */
export function VoiceAgentToolsCard() {
    const { bookingForm, bookingDirty, bookingError, savingBooking, saveBooking } = usePage<UseVoiceAgentEditorPageReturn>();

    return (
        <Card id={VOICE_AGENT_TOOLS_ID} className="h-auto min-w-0 scroll-mt-4" data-testid="voice-agent-tools">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    Tools
                    {bookingDirty ? (
                        <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Unsaved changes</span>
                    ) : null}
                </CardTitle>
                <CardDescription>Things the agent can do during a call. Changes apply from the next call.</CardDescription>
                {/* Booking saves here; custom tools save as soon as they change. */}
                <CardSaveActions
                    dirty={bookingDirty}
                    error={bookingError}
                    saving={savingBooking}
                    onDiscard={() => bookingForm.reset()}
                    onSave={saveBooking}
                    saveLabel="Save booking"
                    errorTestId="booking-error"
                />
            </CardHeader>
            <CardContent className="grid gap-5">
                <BookingToolSection />
                <Separator />
                <CustomToolsSection />
            </CardContent>
        </Card>
    );
}
