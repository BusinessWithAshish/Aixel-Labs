'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { supportsFlexGap } from '../_lib/client';
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
        // A long press must never open the browser's copy / search / save menu over the game.
        // Text boxes keep theirs, so a name can still be pasted.
        const noMenu = (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (!target?.closest('input, textarea')) e.preventDefault();
        };
        document.addEventListener('contextmenu', noMenu);
        // Browsers from before 2021 have no gap in flex layouts: business.css gives them margins instead.
        document.querySelector('.bb')?.classList.toggle('nogap', !supportsFlexGap());
        return () => {
            off();
            stopMusic();
            document.removeEventListener('contextmenu', noMenu);
        };
    }, []);
    return <BusinessConfigContext.Provider value={wsUrl}>{children}</BusinessConfigContext.Provider>;
}

export const useBusinessServerWsUrl = () => useContext(BusinessConfigContext);
