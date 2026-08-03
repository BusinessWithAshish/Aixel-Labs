'use client';

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ButtonHTMLAttributes,
    type ReactNode,
    type AnchorHTMLAttributes,
} from 'react';
import { format } from 'date-fns';
import { Clock, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
    APP_URL,
    BOOKING_COMPANY_SIZES,
    BOOKING_TIME_SLOTS,
    BOOKING_WEBHOOK,
    EMPTY_BOOKING_FORM,
    LABELS,
} from '../constants';

/* -------------------------------------------------------------------------- */
/* Booking context + drawer                                                   */
/* -------------------------------------------------------------------------- */

type BookingContextValue = {
    open: boolean;
    openBooking: () => void;
    closeBooking: () => void;
    setOpen: (open: boolean) => void;
};

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);

    const openBooking = useCallback(() => setOpen(true), []);
    const closeBooking = useCallback(() => setOpen(false), []);

    const value = useMemo(
        () => ({ open, openBooking, closeBooking, setOpen }),
        [open, openBooking, closeBooking],
    );

    return (
        <BookingContext.Provider value={value}>
            {children}
            <BookingDrawer open={open} onOpenChange={setOpen} />
        </BookingContext.Provider>
    );
}

export function useBooking() {
    const ctx = useContext(BookingContext);
    if (!ctx) {
        throw new Error('useBooking must be used within BookingProvider');
    }
    return ctx;
}

function BookingDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const [formData, setFormData] = useState({ ...EMPTY_BOOKING_FORM });
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [timeSlot, setTimeSlot] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    }

    function handleDateSelect(selectedDate: Date | undefined) {
        setDate(selectedDate);
        setTimeSlot('');
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!date || !timeSlot || !formData.name || !formData.email || !formData.companySize) {
            toast.error('Please fill in all fields to book your call.');
            return;
        }

        setIsSubmitting(true);

        try {
            const submissionData = {
                ...formData,
                date: date.toLocaleDateString(),
                timeSlot,
            };

            const res = await fetch(BOOKING_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submissionData),
            });

            if (!res.ok) {
                throw new Error(`Webhook failed with ${res.status}`);
            }

            toast.success(`Call scheduled for ${format(date, 'PPP')} at ${timeSlot}.`);

            setDate(undefined);
            setTimeSlot('');
            setFormData({ ...EMPTY_BOOKING_FORM });
            onOpenChange(false);
        } catch {
            toast.error('Failed to schedule call. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="!max-h-[90dvh]">
                <div className="mx-auto h-full w-full max-w-2xl overflow-auto pr-1">
                    <DrawerHeader className="text-center">
                        <DrawerTitle className="text-2xl">Book Your Free Audit Call</DrawerTitle>
                        <DrawerDescription>
                            Schedule a 30-minute call with our AI automation experts to discover how we can help your
                            business.
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="p-6 pt-0">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="booking-name">Your Name</Label>
                                    <Input
                                        id="booking-name"
                                        name="name"
                                        placeholder="Enter your name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="booking-email">Email Address</Label>
                                    <Input
                                        id="booking-email"
                                        name="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="booking-company-size">Company Size</Label>
                                <Select
                                    value={formData.companySize}
                                    onValueChange={(value) =>
                                        setFormData((prev) => ({ ...prev, companySize: value }))
                                    }
                                >
                                    <SelectTrigger
                                        id="booking-company-size"
                                        className="w-full"
                                        name="companySize"
                                    >
                                        <SelectValue placeholder="Select company size" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BOOKING_COMPANY_SIZES.map((size) => (
                                            <SelectItem key={size} value={size}>
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Select Date</Label>
                                <div className="flex justify-center rounded-md border border-border p-3">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={handleDateSelect}
                                        className="mx-auto pointer-events-auto"
                                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                    />
                                </div>
                            </div>

                            {date ? (
                                <div className="space-y-2">
                                    <Label>Select Time</Label>
                                    <div className="grid max-h-[200px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                                        {BOOKING_TIME_SLOTS.map((time) => (
                                            <Button
                                                key={time}
                                                type="button"
                                                variant={timeSlot === time ? 'default' : 'outline'}
                                                className="gap-1"
                                                onClick={() => setTimeSlot(time)}
                                            >
                                                <Clock className="size-3" />
                                                {time}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <Button type="submit" className="sticky bottom-2 h-12 w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        <span>Scheduling...</span>
                                    </span>
                                ) : (
                                    'Schedule Call'
                                )}
                            </Button>
                        </form>
                    </div>
                </div>
            </DrawerContent>
        </Drawer>
    );
}

/* -------------------------------------------------------------------------- */
/* CTA primitives                                                             */
/* -------------------------------------------------------------------------- */

type StartFreeLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    children?: ReactNode;
};

/** Canonical “Start free” link to the app. */
export function StartFreeLink({ children = LABELS.startFree, className, ...props }: StartFreeLinkProps) {
    return (
        <a href={APP_URL} target="_blank" rel="noopener noreferrer" className={cn(className)} {...props}>
            {children}
        </a>
    );
}

type BookCallButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
};

/** Opens the landing booking drawer. Drop-in replacement for “Book a call” links. */
export function BookCallButton({ children, className, onClick, type = 'button', ...props }: BookCallButtonProps) {
    const { openBooking } = useBooking();

    return (
        <button
            type={type}
            className={cn('cursor-pointer', className)}
            onClick={(e) => {
                onClick?.(e);
                if (!e.defaultPrevented) openBooking();
            }}
            {...props}
        >
            {children}
        </button>
    );
}
