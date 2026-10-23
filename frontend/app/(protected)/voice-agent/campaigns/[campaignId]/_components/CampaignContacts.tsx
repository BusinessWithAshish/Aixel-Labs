'use client';

import Link from 'next/link';
import { ArrowRight, CalendarCheck, ShieldBan } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceCampaignContactStatus } from '@aixellabs/backend/db/types';
import type { VoiceCampaignContactFilter, VoiceCampaignContactItem } from '@/app/actions/voice-campaign-actions';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseCampaignDetailPageReturn } from '../_hooks/use-campaign-detail-page';
import { outcomeLabel } from '@/helpers/voice-call-outcomes';
import { formatShortDateTime } from '@/helpers/voice-time';
import { CONTACT_STATUS } from '../../_utils/campaign-format';

const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

function ContactRow({ contact }: { contact: VoiceCampaignContactItem }) {
    const status = CONTACT_STATUS[contact.status];
    const dnc = contact.status === VoiceCampaignContactStatus.SKIPPED_DNC;
    const waitingRetry = contact.status === VoiceCampaignContactStatus.PENDING && contact.attempts > 0 && contact.nextAttemptAt;
    const outcome = outcomeLabel(contact.lastOutcome);
    const vars = Object.entries(contact.variables);

    return (
        <li
            className={cn('flex flex-col gap-1.5 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4', dnc && 'bg-muted/40')}
            data-testid="campaign-contact"
            data-status={contact.status}
        >
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium">{contact.name ?? 'No name'}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">row {contact.row}</span>
                </span>
                <span className="tabular-nums">{contact.phone}</span>
                {vars.length ? (
                    <span className="text-muted-foreground truncate text-xs" title={vars.map(([k, v]) => `${k}: ${v}`).join('\n')}>
                        {vars.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </span>
                ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:w-64 sm:items-end">
                <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={status.variant} className="gap-1" data-testid="contact-status">
                        {dnc ? <ShieldBan className="size-3" aria-hidden /> : null}
                        {status.label}
                    </Badge>
                    {contact.booked ? (
                        <Badge variant="green" className="gap-1" data-testid="contact-booked">
                            <CalendarCheck className="size-3" aria-hidden />
                            Booked
                        </Badge>
                    ) : null}
                </span>
                <span className="text-muted-foreground text-xs sm:text-right" data-testid="contact-detail">
                    {dnc
                        ? 'Asked not to be called on an earlier call. Not called.'
                        : [
                              contact.attempts ? `${contact.attempts} ${contact.attempts === 1 ? 'call' : 'calls'}` : null,
                              outcome ? `last: ${outcome}` : null,
                              waitingRetry ? `next try ${formatShortDateTime(contact.nextAttemptAt!)}` : null,
                          ]
                              .filter(Boolean)
                              .join(' · ') || 'Not called yet'}
                </span>
                {contact.lastError && contact.status === VoiceCampaignContactStatus.FAILED ? (
                    <span className="text-destructive text-xs break-words sm:text-right">{contact.lastError}</span>
                ) : null}
                {contact.lastCallId ? (
                    <Link
                        href={`${CALL_LOGS_URL}/${contact.lastCallId}`}
                        className="text-primary inline-flex w-fit items-center gap-1 text-xs underline-offset-4 hover:underline"
                        data-testid="contact-call-link"
                    >
                        View call
                        <ArrowRight className="size-3" aria-hidden />
                    </Link>
                ) : null}
            </div>
        </li>
    );
}

export function CampaignContacts() {
    const { campaign, contacts, matching, filter, setFilter, loadingFilter } = usePage<UseCampaignDetailPageReturn>();
    const s = campaign.stats;
    const options: { value: VoiceCampaignContactFilter; label: string; count: number }[] = [
        { value: 'all', label: 'All contacts', count: s.total },
        { value: VoiceCampaignContactStatus.PENDING, label: CONTACT_STATUS.PENDING.label, count: s.pending },
        { value: VoiceCampaignContactStatus.CALLING, label: CONTACT_STATUS.CALLING.label, count: s.calling },
        { value: VoiceCampaignContactStatus.ANSWERED, label: CONTACT_STATUS.ANSWERED.label, count: s.answered },
        { value: 'booked', label: 'Booked', count: s.booked },
        { value: VoiceCampaignContactStatus.UNREACHED, label: CONTACT_STATUS.UNREACHED.label, count: s.unreached },
        { value: VoiceCampaignContactStatus.FAILED, label: CONTACT_STATUS.FAILED.label, count: s.failed },
        { value: VoiceCampaignContactStatus.SKIPPED_DNC, label: CONTACT_STATUS.SKIPPED_DNC.label, count: s.skipped },
        { value: VoiceCampaignContactStatus.CANCELLED, label: CONTACT_STATUS.CANCELLED.label, count: s.cancelled },
    ];

    return (
        <section className="flex flex-col gap-3" aria-labelledby="campaign-contacts-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2 id="campaign-contacts-heading" className="font-semibold">
                        Contacts
                    </h2>
                    {s.skipped ? (
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs" data-testid="campaign-dnc-note">
                            <ShieldBan className="size-3.5" aria-hidden />
                            {s.skipped} on the do-not-call list: skipped, never dialled.
                        </p>
                    ) : null}
                </div>
                <div className="flex w-full flex-col gap-1.5 sm:w-56">
                    <Label htmlFor="campaign-contact-filter">Show</Label>
                    <Select value={filter} onValueChange={(v) => void setFilter(v as VoiceCampaignContactFilter)}>
                        <SelectTrigger id="campaign-contact-filter" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options
                                .filter((o) => o.value === 'all' || o.count > 0 || o.value === filter)
                                .map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label} <span className="text-muted-foreground tabular-nums">({o.count})</span>
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {contacts.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">No contacts here.</p>
            ) : (
                <ul
                    className={cn('bg-card divide-y rounded-lg border transition-opacity', loadingFilter && 'opacity-60')}
                    aria-label="Campaign contacts"
                >
                    {contacts.map((contact) => (
                        <ContactRow key={contact.id} contact={contact} />
                    ))}
                </ul>
            )}
            {matching > contacts.length ? (
                <p className="text-muted-foreground text-xs">
                    Showing the first {contacts.length.toLocaleString()} of {matching.toLocaleString()}. Pick a status above to see
                    the rest.
                </p>
            ) : null}
        </section>
    );
}
