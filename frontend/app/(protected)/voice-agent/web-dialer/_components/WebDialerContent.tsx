import Link from 'next/link';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import PageLayout from '@/components/common/PageLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SubModuleUrls } from '@/config/app-config';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { formatDuration } from '@/helpers/voice-call-format';
import { Dialpad } from './Dialpad';
import { PhoneDisplay } from './PhoneDisplay';
import { CallActions } from './CallActions';
import type { UseWebDialerPageReturn } from '../_hooks/useWebDialerPage';

/** Call from one of your numbers, in the browser. */
export function WebDialerContent() {
    const {
        numbers,
        numberId,
        setNumberId,
        dialed,
        setDialed,
        tones,
        phase,
        seconds,
        muted,
        error,
        pressKey,
        backspace,
        call,
        hangup,
        toggleMute,
    } = usePage<UseWebDialerPageReturn>();
    const number = numbers?.find((n) => n.id === numberId) ?? null;
    const inCall = phase !== 'idle';
    const status = { idle: '', starting: 'Connecting…', ringing: 'Ringing…', active: formatDuration(seconds) }[phase];

    return (
        <PageLayout title="Web dialer">
            <Card className="mx-auto w-full max-w-md">
                <CardContent className="space-y-6 p-6 sm:p-8">
                    {numbers === null ? (
                        <Skeleton className="h-10 w-full" />
                    ) : numbers.length === 0 ? (
                        <p className="text-sm">
                            You call from one of your phone numbers, and you have none yet.{' '}
                            <Link
                                className="text-primary underline-offset-4 hover:underline"
                                href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}
                            >
                                Connect a number
                            </Link>
                            .
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="web-dialer-from">Call from</Label>
                            <Select value={numberId} onValueChange={setNumberId} disabled={inCall}>
                                <SelectTrigger id="web-dialer-from">
                                    <SelectValue placeholder="Choose a number" />
                                </SelectTrigger>
                                <SelectContent>
                                    {numbers.map((n) => (
                                        <SelectItem key={n.id} value={n.id} disabled={!!n.problem}>
                                            <span className="tabular-nums">{n.phoneNumber}</span>
                                            <span className="text-muted-foreground">
                                                {' '}
                                                · {numberProviderInfo(n.provider).label}
                                            </span>
                                            {n.problem ? (
                                                <span className="text-muted-foreground block text-xs">{n.problem}</span>
                                            ) : null}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-muted-foreground text-xs">
                                {number?.answeredByAi
                                    ? 'Calls to this number still go to your AI agent. This phone only makes calls.'
                                    : 'This phone only makes calls. Calls to your number ring where they do today.'}
                            </p>
                        </div>
                    )}

                    {inCall ? (
                        <div className="space-y-1 text-center">
                            <p className="text-xl tabular-nums sm:text-2xl">{dialed}</p>
                            <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
                                {status}
                                {tones ? ` · ${tones}` : ''}
                            </p>
                        </div>
                    ) : (
                        <PhoneDisplay value={dialed} onChange={setDialed} onBackspace={backspace} />
                    )}

                    {error ? (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : null}

                    <Dialpad onButtonClick={pressKey} onLongPress={() => !inCall && pressKey('+')} />

                    <CallActions
                        onCall={call}
                        onHangup={hangup}
                        onToggleMute={toggleMute}
                        isCallDisabled={!number || !dialed.trim()}
                        isInCall={inCall}
                        isMuted={muted}
                    />
                </CardContent>
            </Card>
        </PageLayout>
    );
}
