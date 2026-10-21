'use client';

import { createContext, useContext } from 'react';
import { USD_DISPLAY, type DisplayCurrency } from '@/helpers/voice-call-cost';

/** The currency costs are shown in (the owner's pick, at today's rate). Dollars outside a provider. */
const DisplayCurrencyContext = createContext<DisplayCurrency>(USD_DISPLAY);

export function DisplayCurrencyProvider({ value, children }: { value: DisplayCurrency; children: React.ReactNode }) {
    return <DisplayCurrencyContext.Provider value={value}>{children}</DisplayCurrencyContext.Provider>;
}

export function useDisplayCurrency(): DisplayCurrency {
    return useContext(DisplayCurrencyContext);
}
