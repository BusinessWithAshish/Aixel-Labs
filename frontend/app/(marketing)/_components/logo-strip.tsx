'use client';

import { TRUSTED_COMPANIES } from '../constants';
import { Reveal, SectionIn } from './primitives';
import { SectionEyebrow } from './primitives';

export function LogoStrip() {
    return (
        <section className="relative bg-primary/5 py-12">
            <SectionIn>
                <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
                    <Reveal>
                        <SectionEyebrow muted className="text-center">
                            Trusted by growth teams at
                        </SectionEyebrow>
                    </Reveal>

                    <div className="marquee-pause relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
                        <div className="marquee-track flex w-max animate-marquee-x items-center gap-10 pr-10 sm:gap-14 sm:pr-14">
                            {[...TRUSTED_COMPANIES, ...TRUSTED_COMPANIES].map((name, i) => (
                                <span
                                    key={`${name}-${i}`}
                                    className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight text-foreground/55 sm:text-base"
                                >
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>

                    <Reveal delay={0.12}>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
                            <RatingBadge source="G2" score="4.8" />
                            <span className="hidden h-3 w-px bg-border sm:block" />
                            <RatingBadge source="Capterra" score="4.7" />
                            <span className="hidden h-3 w-px bg-border sm:block" />
                            <RatingBadge source="Product Hunt" score="5.0" />
                            <span className="hidden h-3 w-px bg-border sm:block" />
                            <span className="inline-flex items-center gap-1.5">
                                <span className="relative flex size-1.5">
                                    <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-emerald-500" />
                                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                                </span>
                                GDPR & SOC 2 ready
                            </span>
                        </div>
                    </Reveal>
                </div>
            </SectionIn>
        </section>
    );
}

function RatingBadge({ source, score }: { source: string; score: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{score}</span>
            <span className="text-foreground/40">★</span>
            <span>{source}</span>
        </span>
    );
}
