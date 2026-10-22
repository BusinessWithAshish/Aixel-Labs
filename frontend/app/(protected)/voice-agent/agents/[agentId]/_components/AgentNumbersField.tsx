'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PhoneCall } from 'lucide-react';
import { VoiceAgentCallType, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { getVoiceAgentOptions, type VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { listMyNumbers, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { TestCallDialog } from '@/components/common/voice-agent/TestCallDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { linkedNumbers, type UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** What a number does now, in a few words ("answers with Front desk"), or null when it does nothing. */
function numberJob(number: VoiceNumberListItem): string | null {
    if (number.inboundAgentName) return `answers with ${number.inboundAgentName}`;
    if (number.outboundAgentName) return `calls with ${number.outboundAgentName}`;
    return null;
}

/**
 * The numbers this agent works on, and changing them: an inbound agent's numbers answer calls with it,
 * an outbound agent's place calls with it. A number does one job, so picking one takes it off another.
 */
export function AgentNumbersField() {
    const { agentId, saved, form, usage, numbers, linking, linkNumbers, geminiKey } =
        usePage<UseVoiceAgentEditorPageReturn>();
    const inbound = saved.callType === VoiceAgentCallType.INBOUND;
    const stray = linkedNumbers(usage, inbound ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND);
    const typePending = form.callType !== saved.callType;

    const [all, setAll] = useState<VoiceNumberListItem[] | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState<'numbers' | 'test' | null>(null);
    const [testCall, setTestCall] = useState<{ agents: VoiceAgentOption[]; geminiKey: VoiceGeminiKeyView } | null>(null);

    const openPicker = async () => {
        setLoading('numbers');
        const response = await listMyNumbers();
        setLoading(null);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not load your numbers');
            return;
        }
        setAll(response.data);
        setPicked(new Set(numbers.map((n) => n.id)));
        setOpen(true);
    };

    const applyPicker = async () => {
        const before = new Set(numbers.map((n) => n.id));
        const link = [...picked].filter((id) => !before.has(id));
        const unlink = [...before].filter((id) => !picked.has(id));
        const ok = (await linkNumbers(unlink, false)) && (await linkNumbers(link, true));
        if (ok) setOpen(false);
    };

    const openTestCall = async () => {
        setLoading('test');
        const [numbersRes, agentsRes] = await Promise.all([listMyNumbers(), getVoiceAgentOptions()]);
        setLoading(null);
        if (!numbersRes.data || !agentsRes.data) {
            toast.error(numbersRes.error ?? agentsRes.error ?? 'Could not open the test call');
            return;
        }
        setAll(numbersRes.data);
        setTestCall({ agents: agentsRes.data.filter((a) => a.id === agentId), geminiKey });
    };

    return (
        <Field data-testid="agent-numbers">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <FieldLabel>Phone numbers</FieldLabel>
                <div className="flex gap-1">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={loading !== null}
                        onClick={() => void openTestCall()}
                    >
                        {loading === 'test' ? <Loader2 className="animate-spin" /> : <PhoneCall className="size-3.5" />}
                        Test call
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        disabled={loading !== null || linking || typePending}
                        onClick={() => void openPicker()}
                        data-testid="agent-numbers-change"
                    >
                        {loading === 'numbers' ? <Loader2 className="animate-spin" /> : null}
                        Change
                    </Button>
                </div>
            </div>
            {numbers.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" data-testid="agent-numbers-list">
                    {numbers.map((n) => (
                        <li key={n.id}>
                            <Badge variant="outline" className="tabular-nums">
                                {n.phoneNumber}
                            </Badge>
                        </li>
                    ))}
                </ul>
            ) : null}
            <FieldDescription className="text-xs">
                {typePending
                    ? 'Save the new call type first.'
                    : numbers.length > 0
                      ? inbound
                          ? 'Calls to these numbers are answered by this agent.'
                          : 'This agent calls from these numbers.'
                      : inbound
                        ? 'No number yet: pick the ones it answers.'
                        : 'No number yet: pick the ones it calls from.'}
            </FieldDescription>
            {stray.length > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="agent-numbers-stray">
                    {stray.map((n) => n.phoneNumber).join(', ')} still {inbound ? 'calls' : 'answers'} with it from before it
                    was {inbound ? 'inbound' : 'outbound'}.{' '}
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        disabled={linking}
                        onClick={() =>
                            void linkNumbers(
                                stray.map((n) => n.id),
                                false,
                            )
                        }
                    >
                        Unlink
                    </Button>
                </p>
            ) : null}

            <Dialog open={open} onOpenChange={(next) => !linking && setOpen(next)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{inbound ? 'Numbers it answers' : 'Numbers it calls from'}</DialogTitle>
                        <DialogDescription>
                            A number does one job at a time: picking one moves it here from what it does now.
                        </DialogDescription>
                    </DialogHeader>
                    {all?.length ? (
                        <ul className="grid gap-1" data-testid="agent-numbers-options">
                            {all.map((n) => {
                                const job = numberJob(n);
                                const mine = numbers.some((x) => x.id === n._id);
                                return (
                                    <li key={n._id}>
                                        <Label className="hover:bg-accent/50 flex items-start gap-3 rounded-md px-2 py-2 font-normal">
                                            <Checkbox
                                                checked={picked.has(n._id)}
                                                onCheckedChange={(checked) =>
                                                    setPicked((set) => {
                                                        const next = new Set(set);
                                                        if (checked) next.add(n._id);
                                                        else next.delete(n._id);
                                                        return next;
                                                    })
                                                }
                                            />
                                            <span className="grid gap-0.5">
                                                <span className="tabular-nums">{n.phoneNumber}</span>
                                                <span className="text-muted-foreground text-xs">
                                                    {numberProviderInfo(n.provider).label}
                                                    {job && !mine ? ` · now ${job}` : ''}
                                                </span>
                                            </span>
                                        </Label>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="text-muted-foreground text-sm">
                            No numbers yet. Connect one on the Phone numbers page.
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={linking} onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" disabled={linking || !all?.length} onClick={() => void applyPicker()}>
                            {linking ? <Loader2 className="animate-spin" /> : null}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {testCall && all ? (
                <TestCallDialog
                    open
                    onOpenChange={(next) => !next && setTestCall(null)}
                    numbers={all}
                    agents={testCall.agents}
                    geminiKey={testCall.geminiKey}
                    numberId={usage.outbound[0]?.id ?? usage.inbound[0]?.id}
                />
            ) : null}
        </Field>
    );
}
