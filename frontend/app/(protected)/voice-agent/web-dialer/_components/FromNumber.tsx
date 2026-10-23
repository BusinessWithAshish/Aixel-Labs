import Link from 'next/link';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { WebPhoneNumber } from '@/app/actions/voice-web-phone-actions';
import { usePage } from '@/contexts/PageStore';
import {
    PhoneNumberLine,
    PhoneNumberSelect,
    type PhoneNumberOption,
} from '@/components/common/voice-agent/PhoneNumberSelect';
import { SubModuleUrls } from '@/config/app-config';
import { countryOfE164 } from '@/helpers/voice-campaign-contacts';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

/** Its country underneath, or why it cannot call from the browser (then it cannot be picked). */
const asOption = (number: WebPhoneNumber): PhoneNumberOption => ({
    ...number,
    detail: number.problem ?? countryOfE164(number.phoneNumber)?.name ?? 'International',
    disabled: !!number.problem,
});

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
                    <PhoneNumberLine number={asOption(numbers[0])} />
                </div>
            ) : (
                <PhoneNumberSelect
                    numbers={numbers.map(asOption)}
                    value={number?.id ?? null}
                    onChange={(id) => id && setNumberId(id)}
                    placeholder="Choose a number to call from"
                    disabled={phase !== 'idle'}
                    aria-label="Calling from"
                    className="bg-muted/60 dark:bg-muted/60 rounded-xl border-0 py-2 shadow-none"
                    data-testid="web-dialer-from"
                />
            )}
        </div>
    );
}
