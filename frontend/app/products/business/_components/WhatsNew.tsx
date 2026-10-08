'use client';

import { Sparkles } from 'lucide-react';
import type { BusinessUpdate } from '../_lib/whats-new';
import { GButton, Pop, Ribbon } from './bits';

/** The game's news since the player last looked: one short list per release, newest first. */
export function WhatsNew({ updates, onClose }: { updates: readonly BusinessUpdate[]; onClose: () => void }) {
    return (
        <Pop onClose={onClose}>
            <Ribbon>What&apos;s new</Ribbon>
            <div className="news">
                {updates.map((update) => (
                    <section key={update.id}>
                        <h4>
                            <Sparkles className="lu" />
                            {update.title}
                        </h4>
                        <ul>
                            {update.points.map((point) => (
                                <li key={point}>{point}</li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
            <GButton tone="green" size="big" onClick={onClose}>
                Got it
            </GButton>
        </Pop>
    );
}
