'use client';

import Link from 'next/link';
import { History, PhoneOff } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SubModuleUrls } from '@/config/app-config';
import { formatDuration } from '@/helpers/voice-call-format';
import { formatMoney } from '@/helpers/voice-call-cost';
import { countryOfE164 } from '@/helpers/voice-campaign-contacts';
import { displayNumber } from '../_utils/web-dialer';
import { Dialpad } from './Dialpad';
import { PhoneDisplay } from './PhoneDisplay';
import { CallActions } from './CallActions';
import { FromNumber } from './FromNumber';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

const STATUS = { mic: 'Allow the microphone…', starting: 'Connecting…', ringing: 'Ringing…' } as const;

/** Call from one of your numbers, in the browser. */
export function WebDialerContent() {
    const page = usePage<UseWebDialerPageReturn>();
    const { numbers, number, dialed, to, usdPerMinute, recents, phase, finished, error } = page;
    const currency = useDisplayCurrency();
    const inCall = phase !== 'idle';

    if (numbers.length === 0) {
        return (
            <EmptyState
                className="mx-auto w-full max-w-md flex-none"
                icon={<PhoneOff />}
                title="No phone number yet"
                description={error ?? 'Calls go out from one of your numbers. Connect one first.'}
            >
                <Button asChild>
                    <Link href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}>Connect a number</Link>
                </Button>
            </EmptyState>
        );
    }

    const country = to ? countryOfE164(to) : null;
    const hint = !dialed
        ? null
        : !to
          ? 'Start with the country code, like +1 or +91'
          : [country?.name, usdPerMinute !== null && `about ${formatMoney(usdPerMinute, currency)} a minute`]
                .filter(Boolean)
                .join(' · ');

    return (
        <Card className="mx-auto h-auto w-full max-w-sm gap-0 py-0">
            <CardHeader className="border-b py-4 [.border-b]:pb-4">
                <FromNumber />
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 px-4 py-6">
                {inCall ? (
                    <div className="space-y-1 text-center">
                        <p className="text-2xl font-medium tabular-nums sm:text-3xl">{displayNumber(dialed)}</p>
                        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
                            {phase === 'active' ? formatDuration(page.seconds) : STATUS[phase]}
                            {page.tones ? ` · ${page.tones}` : ''}
                        </p>
                    </div>
                ) : (
                    <div className="w-full space-y-1 text-center">
                        <PhoneDisplay
                            value={displayNumber(dialed)}
                            onChange={page.setDialed}
                            onBackspace={page.backspace}
                            onEnter={page.call}
                        />
                        <p className="text-muted-foreground min-h-5 text-sm" data-testid="web-dialer-hint">
                            {finished && !error
                                ? `Call ended${finished.seconds ? ` · ${formatDuration(finished.seconds)}` : ''}${finished.usd !== null ? ` · about ${formatMoney(finished.usd, currency)}` : ''}`
                                : hint}
                        </p>
                    </div>
                )}

                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : !inCall && page.micBlocked ? (
                    <Alert>
                        <AlertDescription>
                            Your browser blocks the microphone here. Allow it from the icon at the left of the address bar.
                        </AlertDescription>
                    </Alert>
                ) : null}

                {!inCall && !dialed && recents.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-2" aria-label="Recent numbers">
                        {recents.map((n) => (
                            <Button
                                key={n}
                                variant="outline"
                                size="sm"
                                className="rounded-full tabular-nums"
                                onClick={() => page.setDialed(n)}
                            >
                                <History />
                                {displayNumber(n)}
                            </Button>
                        ))}
                    </div>
                ) : null}

                {!inCall || page.keypadOpen ? (
                    <Dialpad onButtonClick={page.pressKey} onLongPress={() => !inCall && page.pressKey('+')} />
                ) : null}

                <CallActions
                    onCall={page.call}
                    onHangup={page.hangup}
                    onToggleMute={page.toggleMute}
                    onToggleKeypad={page.toggleKeypad}
                    isCallDisabled={!number || !!number.problem || !dialed.trim()}
                    isInCall={inCall}
                    isMuted={page.muted}
                    isKeypadOpen={page.keypadOpen}
                />
            </CardContent>
        </Card>
    );
}
