'use client';

import { useState } from 'react';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { LABELS, SECTION_IDS, WELCOME_CODE } from '../constants';
import { BookCallButton } from './booking';
import { LandingSection } from './primitives';
import { StartFreeLink } from './booking';

export function FinalCta() {
    const [copied, setCopied] = useState(false);

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(WELCOME_CODE);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard may be blocked; ignore
        }
    }

    return (
        <LandingSection id={SECTION_IDS.getStarted} tone="muted">
            <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
                    Start free. Or book a call.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-pretty text-base text-muted-foreground">
                    Run scrapers on the platform, or talk to our agency about automation.
                </p>

                <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                    <StartFreeLink className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                        {LABELS.startFree}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </StartFreeLink>
                    <BookCallButton className="inline-flex h-12 items-center justify-center rounded-xl px-7 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5">
                        {LABELS.bookCall}
                    </BookCallButton>
                </div>

                <button
                    type="button"
                    onClick={copyCode}
                    className="mx-auto mt-8 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <span className="font-mono text-[13px] font-medium tracking-wide text-primary">
                        {WELCOME_CODE}
                    </span>
                    <span className="text-foreground/25">·</span>
                    <span>1,000 free leads</span>
                    <span className="text-foreground/25">·</span>
                    <span className="inline-flex items-center gap-1">
                        {copied ? (
                            <>
                                <Check className="size-3.5 text-primary" />
                                Copied
                            </>
                        ) : (
                            <>
                                <Copy className="size-3.5" />
                                Copy
                            </>
                        )}
                    </span>
                </button>
            </div>
        </LandingSection>
    );
}
