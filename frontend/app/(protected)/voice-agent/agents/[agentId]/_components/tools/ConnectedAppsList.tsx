'use client';

import { useState } from 'react';
import { Unplug } from 'lucide-react';
import {
    VoiceCalendarConnectionStatus,
    type VoiceCalendarConnection,
    type VoiceCalendarProvider,
} from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

/**
 * The owner's accounts on one booking app, connected through Composio (they sign in on Composio's page; we
 * never see their password or tokens). Shared by all their agents; connecting is under "Where bookings go".
 */
export function ConnectedAppsList({ provider }: { provider: VoiceCalendarProvider }) {
    const {
        connectedAppsConfigured,
        connections: all,
        connecting,
        connectApp,
        disconnecting,
        disconnectApp,
    } = usePage<UseVoiceAgentEditorPageReturn>();
    const connections = all.filter((c) => c.provider === provider);
    const [toRemove, setToRemove] = useState<VoiceCalendarConnection | null>(null);

    if (connections.length === 0) return null;

    const confirmRemove = async () => {
        if (!toRemove) return;
        if (await disconnectApp(toRemove)) setToRemove(null);
    };
    const isActive = (c: VoiceCalendarConnection) => c.status === VoiceCalendarConnectionStatus.ACTIVE;
    /** The dialog's app, and whether it is an attempt that never connected (removed, not disconnected). */
    const removing = toRemove ? voiceCalendarProviderInfo(toRemove.provider).label : '';
    const attempt = !!toRemove && !isActive(toRemove);

    return (
        <div className="grid gap-2" data-testid="connected-apps">
            <p className="text-muted-foreground text-xs">Your connected accounts, shared by all your agents</p>
            <ul className="bg-background divide-y rounded-md border" data-testid="connected-apps-list">
                {connections.map((c) => {
                    const info = voiceCalendarProviderInfo(c.provider);
                    const active = isActive(c);
                    const name = `${info.label}${c.label ? ` (${c.label})` : ''}`;
                    return (
                        <li
                            key={c._id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                            data-testid={`connected-app-${c.provider}`}
                        >
                            <CalendarProviderLogo provider={c.provider} />
                            <div className="grid min-w-40 flex-1 gap-0.5">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                    {info.label}
                                    {active ? (
                                        <Badge variant="secondary">Connected</Badge>
                                    ) : (
                                        <Badge variant="destructive">Not connected</Badge>
                                    )}
                                </span>
                                {c.label ? (
                                    <span className="text-muted-foreground truncate text-xs" title={c.label}>
                                        {c.label}
                                    </span>
                                ) : null}
                            </div>
                            <div className="ml-auto flex gap-2">
                                {!active ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void connectApp(c.provider)}
                                        disabled={!!connecting || !connectedAppsConfigured}
                                    >
                                        Try again
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setToRemove(c)}
                                    disabled={disconnecting === c._id}
                                    aria-label={`${active ? 'Disconnect' : 'Remove'} ${name}`}
                                >
                                    <Unplug className="size-4" />
                                    {active ? 'Disconnect' : 'Remove'}
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <ConfirmDialog
                open={!!toRemove}
                onOpenChange={(open) => !open && setToRemove(null)}
                title={attempt ? `Remove this ${removing} attempt?` : `Disconnect ${removing}?`}
                alertMessage={
                    attempt
                        ? 'It never finished connecting, so no agent books into it.'
                        : `Agents that book into ${toRemove?.label || `this ${removing} account`} go back to the built-in calendar. Bookings already made stay in ${removing} and in Bookings.`
                }
                onConfirm={() => void confirmRemove()}
                isLoading={!!disconnecting}
                confirmText={attempt ? 'Remove' : 'Disconnect'}
            />
        </div>
    );
}
