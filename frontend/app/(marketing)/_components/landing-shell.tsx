'use client';

import { useCallback, useState } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT_EXPO } from '../constants';
import { BookingProvider } from './booking';
import { Consultancy } from './consultancy';
import { FinalCta } from './final-cta';
import { Hero } from './hero';
import { LogoStrip } from './logo-strip';
import { MarketingFooter } from './marketing-footer';
import { MarketingNav } from './marketing-nav';
import { Pillars } from './pillars';
import { ProductBento } from './product-bento';
import { ScrollHashSync, ScrollProgress } from './scroll-chrome';
import { SplashScreen } from './splash-screen';
import { Stats } from './stats';
import { Testimonials } from './testimonials';
import { UseCases } from './use-cases';

export function LandingShell() {
    const [splashComplete, setSplashComplete] = useState(false);
    const [reveal, setReveal] = useState(false);

    const onExitStart = useCallback(() => setReveal(true), []);
    const onComplete = useCallback(() => setSplashComplete(true), []);

    return (
        <BookingProvider>
            {!splashComplete && (
                <SplashScreen onExitStart={onExitStart} onComplete={onComplete} />
            )}

            {/* Fixed UI must sit outside any transformed ancestor */}
            {reveal && (
                <>
                    <ScrollProgress />
                    <ScrollHashSync />
                    <MarketingNav />
                </>
            )}

            <motion.main
                className="relative w-full overflow-x-hidden bg-background"
                initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                animate={
                    reveal
                        ? {
                              opacity: 1,
                              y: 0,
                              filter: 'blur(0px)',
                              transition: { duration: 0.95, ease: EASE_OUT_EXPO, delay: 0.05 },
                          }
                        : { opacity: 0, y: 20, filter: 'blur(10px)' }
                }
            >
                <Hero />
                <LogoStrip />
                <Pillars />
                <ProductBento />
                <Consultancy />
                <Stats />
                <Testimonials />
                <UseCases />
                <FinalCta />
                <MarketingFooter />
            </motion.main>
        </BookingProvider>
    );
}
