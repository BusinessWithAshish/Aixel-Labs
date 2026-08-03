'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT_EXPO, SPLASH_VIDEOS } from '../constants';

function pickVideo() {
    return SPLASH_VIDEOS[Math.floor(Math.random() * SPLASH_VIDEOS.length)]!;
}

type SplashScreenProps = {
    /** Called when the iris-out starts so the page can begin revealing underneath. */
    onExitStart?: () => void;
    /** Called after the splash has fully finished. */
    onComplete: () => void;
};

/**
 * Fullscreen logo splash. Picks Assemble / Draw / Orbit at random,
 * then iris-out reveals the landing page.
 */
export function SplashScreen({ onExitStart, onComplete }: SplashScreenProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [exiting, setExiting] = useState(false);
    const [alive, setAlive] = useState(true);
    const startedExit = useRef(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mq.matches) {
            onExitStart?.();
            onComplete();
            setAlive(false);
            return;
        }
        setSrc(pickVideo());
    }, [onComplete, onExitStart]);

    useEffect(() => {
        if (!alive) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [alive]);

    function beginExit() {
        if (startedExit.current) return;
        startedExit.current = true;
        onExitStart?.();
        setExiting(true);
    }

    useEffect(() => {
        if (!src) return;
        const t = window.setTimeout(beginExit, 9000);
        return () => window.clearTimeout(t);
        // beginExit guarded by ref
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    if (!alive) return null;

    if (!src) {
        return <div className="fixed inset-0 z-10000 bg-black" aria-hidden />;
    }

    return (
        <motion.div
            className="fixed inset-0 z-10000 flex items-center justify-center bg-black"
            initial={{ clipPath: 'circle(150% at 50% 50%)' }}
            animate={{
                clipPath: exiting ? 'circle(0% at 50% 50%)' : 'circle(150% at 50% 50%)',
            }}
            transition={
                exiting
                    ? { duration: 0.9, ease: [0.76, 0, 0.24, 1] }
                    : { duration: 0 }
            }
            onAnimationComplete={() => {
                if (!exiting) return;
                setAlive(false);
                onComplete();
            }}
        >
            <motion.div
                className="relative flex h-full w-full items-center justify-center"
                animate={
                    exiting
                        ? { scale: 1.1, opacity: 0.65 }
                        : { scale: 1, opacity: 1 }
                }
                transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
            >
                <video
                    src={src}
                    className="h-full w-full max-h-dvh max-w-full object-contain"
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    onEnded={beginExit}
                    onError={beginExit}
                />
            </motion.div>

            {!exiting && (
                <button
                    type="button"
                    onClick={beginExit}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 cursor-pointer text-xs tracking-wide text-white/45 transition-colors hover:text-white/80"
                >
                    Skip
                </button>
            )}
        </motion.div>
    );
}
