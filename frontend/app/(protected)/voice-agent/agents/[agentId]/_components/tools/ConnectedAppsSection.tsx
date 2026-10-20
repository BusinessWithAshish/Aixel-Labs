'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Link2, Loader2, Unplug } from 'lucide-react';
import { VoiceCalendarConnectionStatus, type VoiceCalendarConnection } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { SettingsSection } from '@/components/common/SettingsSection';
import { usePage } from '@/contexts/PageStore';
import { VOICE_CALENDAR_PROVIDERS, voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { CalendarProviderLogo } from '../../../_components/CalendarProviderLogo';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

/** CRMs the agent will write to next (not connectable yet). */
const CRM_LOGOS = ['highlevel', 'hubspot', 'salesforce'];

/**
 * The owner's own booking apps, connected through Composio (they sign in on Composio's page;
 * we never see their password or tokens). Shared by all their agents; each agent picks one
 * under "Where bookings go".
 */
export function ConnectedAppsSection() {
    const { connectedAppsConfigured, connections, connecting, connectApp, disconnecting, disconnectApp } =
        usePage<UseVoiceAgentEditorPageReturn>();
    const [toRemove, setToRemove] = useState<VoiceCalendarConnection | null>(null);

    const confirmRemove = async () => {
        if (!toRemove) return;
        if (await disconnectApp(toRemove)) setToRemove(null);
    };
    const isActive = (c: VoiceCalendarConnection) => c.status === VoiceCalendarConnectionStatus.ACTIVE;
    /** The dialog's app, and whether it is an attempt that never connected (removed, not disconnected). */
    const removing = toRemove ? voiceCalendarProviderInfo(toRemove.provider).label : '';
    const attempt = !!toRemove && !isActive(toRemove);

    return (
        <SettingsSection
            titleId="connected-apps-title"
            icon={Link2}
            title="Connected apps"
            description="Your own calendars and booking apps, for the agent to book into. Shared by all your agents. You sign in on a secure page from Composio, our connection partner."
            data-testid="connected-apps"
        >
            {connections.length > 0 ? (
                <ul className="divide-y rounded-md border" data-testid="connected-apps-list">
                    {connections.map((c) => {
                        const info = voiceCalendarProviderInfo(c.provider);
                        const active = isActive(c);
                        const name = `${info.label}${c.label ? ` (${c.label})` : ''}`;
                        return (
                            <li
                                key={c._id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
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
            ) : null}

            {connectedAppsConfigured ? (
                <div className="grid gap-2 sm:grid-cols-2" data-testid="connect-app-buttons">
                    {VOICE_CALENDAR_PROVIDERS.map((p) => {
                        // A second account of an app it already has (another calendar owner, say).
                        const action = connections.some((c) => c.provider === p.provider && isActive(c))
                            ? `Connect another ${p.label} account`
                            : `Connect ${p.label}`;
                        return (
                            <Button
                                key={p.provider}
                                type="button"
                                variant="outline"
                                className="h-auto min-w-0 justify-start gap-3 px-3 py-2 text-left whitespace-normal"
                                onClick={() => void connectApp(p.provider)}
                                disabled={!!connecting}
                                aria-label={action}
                            >
                                {connecting === p.provider ? (
                                    <Loader2 className="size-5 shrink-0 animate-spin" />
                                ) : (
                                    <CalendarProviderLogo provider={p.provider} />
                                )}
                                <span className="grid min-w-0 gap-0.5">
                                    <span className="text-sm font-medium">{action}</span>
                                    <span className="text-muted-foreground text-xs font-normal">{p.blurb}</span>
                                </span>
                            </Button>
                        );
                    })}
                    <div
                        className="flex min-w-0 items-center gap-3 rounded-md border border-dashed px-3 py-2 sm:col-span-2"
                        aria-disabled="true"
                        data-testid="connect-crm-soon"
                    >
                        <span className="flex shrink-0 gap-1">
                            {CRM_LOGOS.map((name) => (
                                <Image
                                    key={name}
                                    src={`/brand-logos/${name}.svg`}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="size-5 object-contain"
                                />
                            ))}
                        </span>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-medium">Connect your own CRM</span>
                            <span className="text-muted-foreground text-xs">GoHighLevel, HubSpot, Salesforce and more.</span>
                        </span>
                        <Badge variant="outline" className="shrink-0">
                            Coming soon
                        </Badge>
                    </div>
                </div>
            ) : (
                <p
                    className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm"
                    data-testid="connected-apps-off"
                >
                    Connecting your own calendar is not switched on for this workspace yet.
                </p>
            )}

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
        </SettingsSection>
    );
}
