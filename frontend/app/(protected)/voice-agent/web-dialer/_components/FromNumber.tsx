import Link from 'next/link';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { WebPhoneNumber } from '@/app/actions/voice-web-phone-actions';
import { usePage } from '@/contexts/PageStore';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubModuleUrls } from '@/config/app-config';
import { countryOfE164, formatPhone } from '@/helpers/voice-campaign-contacts';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

function NumberLine({ number }: { number: WebPhoneNumber }) {
    const country = countryOfE164(number.phoneNumber);
    return (
        <span className="flex min-w-0 items-center gap-2.5 text-left">
            <NumberProviderLogo provider={number.provider} />
            <span className="flex min-w-0 flex-col">
                <span className="font-medium tabular-nums">{formatPhone(number.phoneNumber)}</span>
                <span className="text-muted-foreground text-xs whitespace-normal">
                    {numberProviderInfo(number.provider).label} · {number.problem ?? country?.name ?? 'International'}
                </span>
            </span>
        </span>
    );
}

/** The number calls go out from, at the top of the phone: shown as it is when there is one, a picker when there are more. */
export function FromNumber() {
    const { numbers, number, setNumberId, phase } = usePage<UseWebDialerPageReturn>();

    return (
        <div className="space-y-1.5 px-4 pt-3">
            <div className="flex items-center justify-between px-1 text-xs">
                <span className="text-muted-foreground">Calling from</span>
                <Link
                    href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}
                    className="text-primary font-medium hover:underline"
                >
                    Attach more numbers
                </Link>
            </div>
            {numbers.length === 1 ? (
                <div className="bg-muted/60 rounded-xl px-3 py-2" data-testid="web-dialer-from">
                    <NumberLine number={numbers[0]} />
                </div>
            ) : (
                <Select value={number?.id ?? ''} onValueChange={setNumberId} disabled={phase !== 'idle'}>
                    <SelectTrigger
                        aria-label="Calling from"
                        className="bg-muted/60 dark:bg-muted/60 w-full rounded-xl border-0 py-2 shadow-none data-[size=default]:h-auto"
                        data-testid="web-dialer-from"
                    >
                        <SelectValue placeholder="Choose a number to call from" />
                    </SelectTrigger>
                    <SelectContent>
                        {numbers.map((n) => (
                            <SelectItem key={n.id} value={n.id} disabled={!!n.problem}>
                                <NumberLine number={n} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}
