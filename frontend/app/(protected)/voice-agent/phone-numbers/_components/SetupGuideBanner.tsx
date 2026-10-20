'use client';

import { useEffect, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { VoiceProvider } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { SETUP_GUIDE_PROVIDERS, setupGuideFor } from '../_utils/setup-guides';

const DISMISSED_KEY = 'aixellabs:voice-agent:setup-guide-banner-dismissed';

function readDismissed(): boolean {
    try {
        return window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

function saveDismissed(): void {
    try {
        window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
        // Storage blocked (private window, policy): the banner just comes back next visit.
    }
}

/** Points first-time users at the setup guide (and the other providers' guides). Dismissed once per browser. */
export function SetupGuideBanner({ provider = VoiceProvider.TELNYX }: { provider?: VoiceProvider }) {
    const { openSetupGuide } = usePage<UsePhoneNumbersPageReturn>();
    // Unknown until mounted, so a dismissed banner never flashes in on hydration.
    const [dismissed, setDismissed] = useState<boolean | null>(null);
    const guide = setupGuideFor(provider);

    useEffect(() => setDismissed(readDismissed()), []);

    if (!guide || dismissed !== false) return null;
    const { label } = numberProviderInfo(provider);
    const withScreenshots = guide.steps.some((step) => step.image);
    const others = SETUP_GUIDE_PROVIDERS.filter((p) => p !== provider && setupGuideFor(p));

    const dismiss = () => {
        saveDismissed();
        setDismissed(true);
    };

    return (
        <div
            role="region"
            aria-label="Setup guide"
            className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:flex-nowrap sm:p-4"
        >
            <BookOpen className="text-primary size-5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
                <span className="font-medium">New to this?</span> See how to set up {label} in {guide.steps.length} steps
                {withScreenshots ? `, with screenshots of the ${label} portal` : ''}.
                {others.map((other) => {
                    const otherLabel = numberProviderInfo(other).label;
                    return (
                        <span key={other}>
                            {' '}
                            Using {otherLabel}?{' '}
                            <button
                                type="button"
                                className="text-primary font-medium underline-offset-4 hover:underline"
                                onClick={() => openSetupGuide(other)}
                            >
                                See the {otherLabel} guide
                            </button>
                            .
                        </span>
                    );
                })}
            </p>
            <div className="flex items-center gap-1">
                <Button type="button" size="sm" onClick={() => openSetupGuide(provider)}>
                    See the guide
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Dismiss the setup guide tip"
                    onClick={dismiss}
                >
                    <X className="size-4" aria-hidden />
                </Button>
            </div>
        </div>
    );
}
