'use client';

import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { voiceCallRecordingApiRoute } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import type { UseCallDetailPageReturn } from '../_hooks/use-call-detail-page';

export function RecordingPlayer() {
    const { call, recording } = usePage<UseCallDetailPageReturn>();
    const callId = call._id ?? '';

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Recording</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                {recording.status === 'loading' ? (
                    <>
                        <Skeleton className="h-10 w-full" />
                        <p className="text-muted-foreground text-xs" role="status">
                            Fetching the recording…
                        </p>
                    </>
                ) : recording.status === 'error' ? (
                    <p className="text-destructive text-sm" role="alert">
                        {recording.message}
                    </p>
                ) : recording.available ? (
                    <>
                        {/* Through the app: a fresh provider link per request, and Range so seeking works. */}
                        <audio
                            controls
                            preload="metadata"
                            src={voiceCallRecordingApiRoute(callId)}
                            className="w-full"
                            aria-label="Call recording"
                        >
                            <track kind="captions" />
                        </audio>
                        <a
                            href={voiceCallRecordingApiRoute(callId, true)}
                            download
                            className="text-primary inline-flex w-fit items-center gap-1 py-1 text-sm underline-offset-4 hover:underline"
                        >
                            <Download className="size-4" aria-hidden />
                            Download {recording.format.toUpperCase()}
                        </a>
                        <p className="text-muted-foreground text-xs">
                            Stored in your {recording.storedBy} account. Aixel Labs keeps no copy.
                        </p>
                    </>
                ) : (
                    <p className="text-muted-foreground text-sm" data-testid="no-recording">
                        {recording.reason}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
