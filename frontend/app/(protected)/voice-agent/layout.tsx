import { DisplayCurrencyProvider } from '@/contexts/DisplayCurrency';
import { getDisplayCurrency } from '@/server/voice-agent/display-currency';

/** Every voice page shows call costs in the owner's currency. */
export default async function VoiceAgentLayout({ children }: { children: React.ReactNode }) {
    return <DisplayCurrencyProvider value={await getDisplayCurrency()}>{children}</DisplayCurrencyProvider>;
}
