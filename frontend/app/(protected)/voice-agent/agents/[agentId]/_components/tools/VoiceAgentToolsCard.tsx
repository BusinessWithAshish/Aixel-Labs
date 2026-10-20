'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { BookingToolSection } from './BookingToolSection';
import { ConnectedAppsSection } from './ConnectedAppsSection';
import { CustomToolsSection } from './CustomToolsSection';

/** The Tools card's id, for scrolling to it. */
export const VOICE_AGENT_TOOLS_ID = 'voice-agent-tools';

/** What the agent can do during a call, beyond talking. Read by the engine at the start of every call. */
export function VoiceAgentToolsCard() {
    return (
        <Card id={VOICE_AGENT_TOOLS_ID} className="h-auto min-w-0 scroll-mt-4" data-testid="voice-agent-tools">
            <CardHeader>
                <CardTitle>Tools</CardTitle>
                <CardDescription>Things the agent can do during a call. Changes apply from the next call.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
                <BookingToolSection />
                <Separator />
                <ConnectedAppsSection />
                <Separator />
                <CustomToolsSection />
            </CardContent>
        </Card>
    );
}
