'use client';

import { useEffect, useState } from 'react';
import { Download, Share } from 'lucide-react';
import { GButton } from './bits';

/** Chrome's own "install this app" prompt, held back so it can be shown from our button. */
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/**
 * A way to put the game on the home screen. Android (and desktop Chrome) can be asked directly;
 * an iPhone or iPad has no such prompt, so the player is told where the button is. Shows nothing
 * once the game is running as an installed app, or in a browser that cannot install it.
 */
export function InstallApp() {
    const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
    const [ios, setIos] = useState(false);
    const [hint, setHint] = useState(false);

    useEffect(() => {
        const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
        if (installed) return;
        // An iPad says it is a Mac, but only an iPad has a touch screen.
        setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        const hold = (e: Event) => {
            e.preventDefault();
            setPrompt(e as InstallPromptEvent);
        };
        const done = () => setPrompt(null);
        window.addEventListener('beforeinstallprompt', hold);
        window.addEventListener('appinstalled', done);
        return () => {
            window.removeEventListener('beforeinstallprompt', hold);
            window.removeEventListener('appinstalled', done);
        };
    }, []);

    if (!prompt && !ios) return null;
    return (
        <div className="install">
            <GButton size="sm" tone="blue" onClick={() => (prompt && !ios ? prompt.prompt() : setHint(!hint))}>
                <Download className="lu" />
                Install the app
            </GButton>
            {hint && (
                <p className="small center">
                    In Safari, tap <Share className="lu" aria-label="Share" /> and then <b>Add to Home Screen</b>.
                </p>
            )}
        </div>
    );
}
