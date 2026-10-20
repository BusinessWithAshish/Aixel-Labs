'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseConnectedAppCallbackPageReturn } from '../_hooks/use-connected-app-callback-page';

/** "Connecting Google Calendar…" while the server checks the connection; the reason and a way back if it fails. */
export function ConnectedAppCallback() {
    const { provider, appLabel, back, backLabel, error } = usePage<UseConnectedAppCallbackPageReturn>();

    if (error) {
        return (
            <Card className="mx-auto mt-6 h-auto w-full max-w-lg" data-testid="connected-app-callback-error">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {provider ? <CalendarProviderLogo provider={provider} /> : null}
                        Not connected
                    </CardTitle>
                    <CardDescription role="alert">{error}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href={back}>{backLabel}</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="mx-auto mt-6 h-auto w-full max-w-lg" role="status" data-testid="connected-app-callback-pending">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {provider ? <CalendarProviderLogo provider={provider} /> : null}
                    Connecting {appLabel}…
                    <Loader2 className="text-muted-foreground ml-auto size-4 shrink-0 animate-spin" />
                </CardTitle>
                <CardDescription>
                    Checking the connection with Composio. You go back to the agent in a moment.
                </CardDescription>
            </CardHeader>
        </Card>
    );
}
