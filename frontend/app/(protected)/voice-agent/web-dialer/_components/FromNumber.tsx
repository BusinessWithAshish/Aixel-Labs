import type { WebPhoneNumber } from '@/app/actions/voice-web-phone-actions';
import { usePage } from '@/contexts/PageStore';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { countryOfE164, formatPhone } from '@/helpers/voice-campaign-contacts';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

function NumberLine({ number }: { number: WebPhoneNumber }) {
    const country = countryOfE164(number.phoneNumber);
    return (
        <span className="flex min-w-0 flex-col items-start text-left">
            <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{formatPhone(number.phoneNumber)}</span>
                <Badge variant="outline">{numberProviderInfo(number.provider).label}</Badge>
            </span>
            <span className="text-muted-foreground text-xs">{number.problem ?? country?.name ?? 'International'}</span>
        </span>
    );
}

/** The number calls go out from: shown as it is when there is one, a picker when there are more. */
export function FromNumber() {
    const { numbers, number, setNumberId, phase } = usePage<UseWebDialerPageReturn>();

    if (numbers.length === 1) {
        return (
            <div className="space-y-1" data-testid="web-dialer-from">
                <p className="text-muted-foreground text-xs">Calling from</p>
                <NumberLine number={numbers[0]} />
            </div>
        );
    }
    return (
        <Select value={number?.id ?? ''} onValueChange={setNumberId} disabled={phase !== 'idle'}>
            <SelectTrigger
                aria-label="Calling from"
                className="w-full py-2 data-[size=default]:h-auto"
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
    );
}
