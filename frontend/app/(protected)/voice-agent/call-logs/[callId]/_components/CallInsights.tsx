'use client';

import { useState } from 'react';
import { BrainCircuit, Braces, ClipboardList } from 'lucide-react';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { formatDay } from '@/helpers/voice-time';
import type { UseCallDetailPageReturn } from '../_hooks/use-call-detail-page';
import { formatFieldValue } from '../../_utils/call-format';
import { CallOutcomeBadges } from '../../_components/CallOutcomeBadges';

/** What the post-call analysis worked out: summary, verdicts, custom fields (or why it failed). */
export function CallAnalysisCard() {
    const { call } = usePage<UseCallDetailPageReturn>();
    const analysis = call.analysis;
    if (!analysis) return null;
    const fields = Object.entries(analysis.fields ?? {});

    return (
        <Card data-testid="call-analysis">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="text-muted-foreground size-4" />
                    Analysis
                </CardTitle>
                <CardDescription>Worked out from the transcript after the call.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
                {analysis.error ? (
                    <p className="text-muted-foreground text-sm" data-testid="call-analysis-error">
                        The analysis could not run: {analysis.error}
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-1.5 empty:hidden">
                            <CallOutcomeBadges analysis={analysis} />
                        </div>
                        {analysis.summary ? <p className="text-sm break-words">{analysis.summary}</p> : null}
                        {fields.length > 0 ? (
                            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                                {fields.map(([name, value]) => (
                                    <div key={name} className="contents" data-testid="call-analysis-field">
                                        <dt className="text-muted-foreground font-mono text-xs leading-5">{name}</dt>
                                        <dd className="font-medium break-words">{formatFieldValue(value)}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

/** What the agent knew about the caller when the call started, and what it remembers now (with Forget). */
export function CallerMemoryCard() {
    const { call, memory, forgetting, forgetCaller } = usePage<UseCallDetailPageReturn>();
    const [confirming, setConfirming] = useState(false);
    if (!call.memoryUsed && !memory) return null;

    return (
        <Card data-testid="call-memory">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <BrainCircuit className="text-muted-foreground size-4" />
                    Caller memory
                </CardTitle>
                <CardDescription>What the agent keeps about this number between calls.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
                {call.memoryUsed ? (
                    <div className="grid gap-1" data-testid="call-memory-used">
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                            Remembered at the start of this call (last call {formatDay(call.memoryUsed.lastCallAt)})
                        </p>
                        <p className="break-words">{call.memoryUsed.brief}</p>
                    </div>
                ) : null}
                {memory ? (
                    <div className="grid gap-1" data-testid="call-memory-now">
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                            Remembers now ({memory.calls === 1 ? '1 call' : `${memory.calls} calls`}, last{' '}
                            {formatDay(memory.lastCallAt)})
                        </p>
                        <p className="break-words">{memory.brief}</p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive mt-1 w-fit"
                            onClick={() => setConfirming(true)}
                        >
                            Forget this caller
                        </Button>
                    </div>
                ) : (
                    <p className="text-muted-foreground text-xs">Nothing is remembered about this number now.</p>
                )}
            </CardContent>
            <ConfirmDialog
                open={confirming}
                onOpenChange={(open) => !forgetting && setConfirming(open)}
                title={`Forget ${memory?.phone ?? 'this caller'}?`}
                alertMessage="The agent starts its next call with this number knowing nothing about them. Call logs stay."
                confirmText="Forget caller"
                onConfirm={() => void forgetCaller().then((done) => done && setConfirming(false))}
                isLoading={forgetting}
            />
        </Card>
    );
}

/** The call's own `{{variable}}` values (a campaign contact's columns, a test call's). */
export function CallVariablesCard() {
    const { call } = usePage<UseCallDetailPageReturn>();
    const variables = Object.entries(call.variables ?? {});
    if (variables.length === 0) return null;

    return (
        <Card data-testid="call-variables">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Braces className="text-muted-foreground size-4" />
                    Variables
                </CardTitle>
                <CardDescription>This call&rsquo;s own values; the agent&rsquo;s defaults filled the rest.</CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                    {variables.map(([name, value]) => (
                        <div key={name} className="contents">
                            <dt className="text-muted-foreground font-mono text-xs leading-5">{`{{${name}}}`}</dt>
                            <dd className="break-words">{value}</dd>
                        </div>
                    ))}
                </dl>
            </CardContent>
        </Card>
    );
}
