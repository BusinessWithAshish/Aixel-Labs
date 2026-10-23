import { Phone } from 'lucide-react';
import { usePage } from '@/contexts/PageStore';
import { countryOfE164 } from '@/helpers/voice-campaign-contacts';
import { displayNumber } from '../_utils/web-dialer';
import type { UseWebDialerPageReturn } from '../_hooks/use-web-dialer-page';

/** The numbers last called from this browser; tapping one puts it back on the keypad. */
export function Recents() {
    const { recents, redial } = usePage<UseWebDialerPageReturn>();

    return (
        <div className="flex flex-col">
            <h2 className="px-4 pt-3 pb-2 text-2xl font-bold">Recents</h2>
            {recents.length === 0 ? (
                <p className="text-muted-foreground px-4 py-10 text-center text-sm">No recent calls from this browser</p>
            ) : (
                <ul className="divide-y border-y" aria-label="Recent numbers">
                    {recents.map((n) => (
                        <li key={n}>
                            <button
                                type="button"
                                onClick={() => redial(n)}
                                className="hover:bg-muted/60 focus-visible:bg-muted/60 flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none"
                            >
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="font-medium tabular-nums">{displayNumber(n)}</span>
                                    <span className="text-muted-foreground text-xs">
                                        {countryOfE164(n)?.name ?? 'International'}
                                    </span>
                                </span>
                                <Phone className="text-primary size-4" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
