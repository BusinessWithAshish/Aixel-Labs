'use client';

import Link from 'next/link';
import { FormProvider } from 'react-hook-form';
import { toast } from 'sonner';
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
 * The two built-in booking tools as rows of the Tools list, each with its own switch. book_appointment books only
 * times check_availability found: turning it on turns check_availability on, and turning check_availability off
 * turns it off (with a note); nothing else moves the other switch. Both open on the same settings: where bookings
 * go and the booking hours. Saved with the Tools card's Save.
 */
export function BookingToolRows({ open, onOpen }: BookingToolRowsProps) {
    const { bookingForm, booking, promptTools } = usePage<UseVoiceAgentEditorPageReturn>();
    const [check, book] = promptTools.filter((tool) => tool.kind === 'booking');

    const setCheck = (on: boolean) => {
        bookingForm.setValue('enabled', on, DIRTY);
        if (!on && bookingForm.getValues('bookAppointment')) {
            bookingForm.setValue('bookAppointment', false, DIRTY);
            toast.info('book_appointment is off too: it books only times check_availability finds.');
        }
    };
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
                {!booking.bookAppointment ? (
                    <Alert variant="info">
                        <Info className="size-4" />
                        <AlertDescription>
                            {booking.enabled
                                ? 'Off: the agent tells callers which times are free and takes a message instead of booking.'
                                : 'Off. It books only times check_availability finds, so turning it on turns check_availability on too.'}
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
