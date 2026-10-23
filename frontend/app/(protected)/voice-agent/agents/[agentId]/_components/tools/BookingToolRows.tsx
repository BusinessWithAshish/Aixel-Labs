'use client';

import Link from 'next/link';
import { FormProvider } from 'react-hook-form';
import { Info } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { BookingDestinationField } from './BookingDestinationField';
import { ToolRow } from './ToolRow';

const DIRTY = { shouldDirty: true, shouldValidate: true };

type BookingToolRowsProps = { open: string | null; onOpen: (name: string | null) => void };

/**
 * The two built-in booking tools as rows of the Tools list. check_availability's switch is the calendar's
 * on/off; book_appointment books only times it found, so it needs check_availability on. Both open on the
 * same settings: where bookings go and the times offered. Saved with the Tools card's Save.
 */
export function BookingToolRows({ open, onOpen }: BookingToolRowsProps) {
    const { bookingForm, booking, promptTools } = usePage<UseVoiceAgentEditorPageReturn>();
    const [check, book] = promptTools.filter((tool) => tool.kind === 'booking');

    const setCheck = (on: boolean) => bookingForm.setValue('enabled', on, DIRTY);
    const setBook = (on: boolean) => {
        bookingForm.setValue('bookAppointment', on, DIRTY);
        if (on) setCheck(true);
    };
    const builtIn = <Badge variant="secondary">Built-in</Badge>;

    return (
        <FormProvider {...bookingForm}>
            <ToolRow
                tool={check}
                switchId="booking-enabled"
                open={open === check.name}
                onOpenChange={(isOpen) => onOpen(isOpen ? check.name : null)}
                onCheckedChange={setCheck}
                badges={builtIn}
                data-testid="booking-tool-row"
            >
                <BookingDestinationField />
            </ToolRow>
            <ToolRow
                tool={book}
                open={open === book.name}
                onOpenChange={(isOpen) => onOpen(isOpen ? book.name : null)}
                onCheckedChange={setBook}
                badges={builtIn}
                data-testid="booking-tool-row"
            >
                {booking.bookAppointment && !booking.enabled ? (
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            It books only times check_availability found, so it is off while check_availability is.
                        </AlertDescription>
                    </Alert>
                ) : null}
                {!booking.bookAppointment && booking.enabled ? (
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            Off: the agent tells callers which times are free and takes a message instead of booking.
                        </AlertDescription>
                    </Alert>
                ) : null}
                <BookingDestinationField />
                <p className="text-muted-foreground text-xs">
                    Every booking is also listed in{' '}
                    <Link
                        href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]}
                        className="text-primary underline-offset-4 hover:underline"
                    >
                        Bookings
                    </Link>
                    . Type / in the prompt to name either tool.
                </p>
            </ToolRow>
        </FormProvider>
    );
}
