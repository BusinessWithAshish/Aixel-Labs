import type { ReactNode } from 'react';
import { Grid3x3, Mic, MicOff, PhoneOff } from 'lucide-react';
import { usePage } from '@/contexts/PageStore';
import { Button } from '@/components/ui/button';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { formatDuration } from '@/helpers/voice-call-format';
import { cn } from '@/lib/utils';
import { ROUND_BUTTON } from '../_utils/constants';
import { displayNumber } from '../_utils/web-dialer';
import { Dialpad } from './Dialpad';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

const STATUS = { mic: 'Allow the microphone…', starting: 'Connecting…', ringing: 'Ringing…' } as const;

type ControlProps = { label: string; pressed?: boolean; onClick: () => void; children: ReactNode };

/** A round in-call control with its name underneath; white while it is on. */
function Control({ label, pressed, onClick, children }: ControlProps) {
    return (
        <div className="flex flex-col items-center gap-1.5">
            <Button
                variant="secondary"
                onClick={onClick}
                aria-label={label}
                aria-pressed={pressed}
                className={cn(ROUND_BUTTON, pressed && 'bg-foreground text-background hover:bg-foreground/90')}
            >
                {children}
            </Button>
            <span className="text-xs">{label}</span>
        </div>
    );
}

/** iOS's in-call screen (the phone turns dark while it lasts): who, how long, mute, keypad for tones, hang up. */
export function InCallScreen() {
    const page = usePage<UseWebDialerPageReturn>();
    const { phase, number, keypadOpen, agentCall } = page;

    return (
        <div className="flex flex-1 flex-col items-center gap-6 px-4 pt-10 pb-8 sm:pt-14">
            <div className="space-y-1.5 text-center">
                <p className="text-3xl font-normal tabular-nums">{agentCall?.name ?? displayNumber(page.dialed)}</p>
                <p className="text-muted-foreground text-base tabular-nums" aria-live="polite">
                    {phase === 'active' ? formatDuration(page.seconds) : STATUS[phase as keyof typeof STATUS]}
                    {page.tones ? ` · ${page.tones}` : ''}
                </p>
                {agentCall ? (
                    <p className="text-muted-foreground text-xs">as if you called {formatPhone(agentCall.phoneNumber)}</p>
                ) : number ? (
                    <p className="text-muted-foreground text-xs">from {formatPhone(number.phoneNumber)}</p>
                ) : null}
            </div>

            <div className="mt-auto flex flex-col items-center gap-6">
                {keypadOpen ? (
                    <Dialpad onButtonClick={page.pressKey} />
                ) : (
                    <div className="flex gap-10">
                        <Control label="Mute" pressed={page.muted} onClick={page.toggleMute}>
                            {page.muted ? <MicOff /> : <Mic />}
                        </Control>
                        <Control label="Keypad" onClick={page.toggleKeypad}>
                            <Grid3x3 />
                        </Control>
                    </div>
                )}
                <div className="grid grid-cols-3 items-center justify-items-center gap-x-6">
                    <span />
                    <Button
                        onClick={page.hangup}
                        aria-label="Hang up"
                        className={cn(ROUND_BUTTON, 'bg-red-500 text-white hover:bg-red-600')}
                    >
                        <PhoneOff />
                    </Button>
                    {keypadOpen ? (
                        <Button variant="link" onClick={page.toggleKeypad} className="text-foreground text-base">
                            Hide
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
