'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { installAudioUnlock, stopMusic } from '../_lib/sound';

/** Backend WebSocket URL as resolved on the server (see the route layout). */
const BusinessConfigContext = createContext<string | null>(null);

/**
 * Wraps every game screen. Also owns the background music, so it starts on the
 * first tap anywhere and keeps playing from the menu into the lobby and the table.
 */
export function BusinessConfigProvider({ wsUrl, children }: { wsUrl: string | null; children: ReactNode }) {
    useEffect(() => {
        const off = installAudioUnlock();
        return () => {
            off();
            stopMusic();
        };
    }, []);
    return <BusinessConfigContext.Provider value={wsUrl}>{children}</BusinessConfigContext.Provider>;
}

export const useBusinessServerWsUrl = () => useContext(BusinessConfigContext);
