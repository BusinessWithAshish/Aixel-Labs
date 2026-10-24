'use client';

import { useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { setupGuideStepIndex, type SetupGuide } from '@/helpers/voice-setup-guides';

type SetupGuideDialogProps = {
    guide: SetupGuide;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Step to show each time the dialog opens; the first step when unset. */
    initialStepId?: string | null;
};

/**
 * Setup steps (a phone provider's, Linphone's) as a carousel in a dialog: a few sentences per step, with a picture
 * when the step has one (a step without one shows its text only).
 */
export function SetupGuideDialog({ guide, open, onOpenChange, initialStepId }: SetupGuideDialogProps) {
    const [index, setIndex] = useState(() => setupGuideStepIndex(guide, initialStepId));
    const [zoomed, setZoomed] = useState(false);
    const [shownFor, setShownFor] = useState({ open, guide, initialStepId });

    // Each opening starts at the requested step, unzoomed.
    if (shownFor.open !== open || shownFor.guide !== guide || shownFor.initialStepId !== initialStepId) {
        setShownFor({ open, guide, initialStepId });
        if (open) {
            setIndex(setupGuideStepIndex(guide, initialStepId));
            setZoomed(false);
        }
    }

    const steps = guide.steps;
    const step = steps[Math.min(index, steps.length - 1)];
    const isFirst = index === 0;
    const isLast = index === steps.length - 1;

    const goTo = (next: number) => {
        setIndex(Math.max(0, Math.min(steps.length - 1, next)));
        setZoomed(false);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goTo(index + 1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goTo(index - 1);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="gap-3 p-4 sm:max-w-4xl sm:gap-4 sm:p-6"
                onKeyDown={onKeyDown}
                aria-roledescription="carousel"
            >
                <DialogHeader className="pr-6">
                    <DialogTitle>{guide.title}</DialogTitle>
                    <DialogDescription aria-live="polite" data-testid="setup-guide-counter">
                        Step {index + 1} of {steps.length}
                    </DialogDescription>
                </DialogHeader>

                <section
                    aria-roledescription="slide"
                    aria-label={`Step ${index + 1} of ${steps.length}: ${step.title}`}
                    className="flex min-w-0 flex-col gap-3"
                >
                    {step.image ? (
                        <div className="relative">
                            <div
                                className={cn(
                                    'bg-muted/40 overflow-hidden rounded-lg border',
                                    zoomed && 'max-h-[60svh] overflow-auto',
                                )}
                                data-testid="setup-guide-image-frame"
                            >
                                <button
                                    type="button"
                                    onClick={() => setZoomed((z) => !z)}
                                    aria-label={zoomed ? 'Fit the picture' : 'Zoom in on the picture'}
                                    className={cn(
                                        'block w-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                        zoomed ? 'w-max cursor-zoom-out' : 'cursor-zoom-in',
                                    )}
                                >
                                    <Image
                                        key={step.image.src}
                                        src={step.image.src}
                                        alt={step.image.alt}
                                        width={step.image.width}
                                        height={step.image.height}
                                        priority
                                        className={cn(
                                            zoomed
                                                ? 'h-auto max-w-none'
                                                : 'mx-auto h-auto max-h-[45svh] w-full object-contain sm:max-h-[52svh]',
                                        )}
                                        style={zoomed ? { width: step.image.width } : undefined}
                                    />
                                </button>
                            </div>
                            <span
                                aria-hidden
                                className="bg-background/90 text-muted-foreground pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs shadow-sm"
                            >
                                {zoomed ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />}
                                {zoomed ? 'Fit' : 'Zoom'}
                            </span>
                        </div>
                    ) : null}

                    <div className="flex min-w-0 flex-col gap-1.5">
                        <h3 className="text-base font-semibold">
                            {index + 1}. {step.title}
                        </h3>
                        {step.body.map((paragraph) => (
                            <p key={paragraph} className="text-muted-foreground text-sm">
                                {paragraph}
                            </p>
                        ))}
                        {step.link ? (
                            <a
                                href={step.link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                            >
                                {step.link.label}
                                <ExternalLink className="size-3.5" aria-hidden />
                            </a>
                        ) : null}
                    </div>
                </section>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <Button type="button" variant="outline" size="sm" disabled={isFirst} onClick={() => goTo(index - 1)}>
                        <ChevronLeft className="size-4" aria-hidden />
                        Previous
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {steps.map((s, i) => (
                            <button
                                key={s.id}
                                type="button"
                                aria-label={`Go to step ${i + 1}: ${s.title}`}
                                aria-current={i === index ? 'step' : undefined}
                                onClick={() => goTo(i)}
                                className={cn(
                                    'size-2.5 rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                    i === index ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60',
                                )}
                            />
                        ))}
                    </div>
                    {isLast ? (
                        <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    ) : (
                        <Button type="button" size="sm" onClick={() => goTo(index + 1)}>
                            Next
                            <ChevronRight className="size-4" aria-hidden />
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
