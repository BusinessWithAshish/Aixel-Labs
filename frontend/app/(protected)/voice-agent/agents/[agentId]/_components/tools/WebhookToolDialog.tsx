'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, type VoiceAgent, type VoiceAgentWebhookToolView } from '@aixellabs/backend/db/types';
import {
    createVoiceAgentWebhookTool,
    sendVoiceAgentWebhookTest,
    updateVoiceAgentWebhookTool,
    type VoiceWebhookTestResult,
} from '@/app/actions/voice-agent-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { WebhookParamRows } from './WebhookParamRows';
import { draftToInput, sameDraft, toolToDraft, webhookDraftError, type WebhookToolDraft } from './webhook-tool-form';

/** The answer to a test request, as the agent would get it. */
function TestResult({ result }: { result: VoiceWebhookTestResult }) {
    const redirect = result.status !== null && result.status >= 300 && result.status < 400;
    return (
        <div
            className={cn(
                'grid gap-2 rounded-md border p-3 text-sm',
                result.ok ? 'border-green-600/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5',
            )}
            role="status"
            data-testid="tool-test-result"
        >
            <p className="font-medium">
                {result.status !== null ? (
                    <>
                        <span className={result.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
                            HTTP {result.status}
                        </span>
                        <span className="text-muted-foreground font-normal"> · {result.durationMs} ms</span>
                    </>
                ) : (
                    <span className="text-destructive">No answer</span>
                )}
            </p>
            {result.error ? <p>{result.error}</p> : null}
            {result.ok ? (
                <p className="text-muted-foreground text-xs">This is what the agent would read back.</p>
            ) : result.status !== null ? (
                <p className="text-muted-foreground text-xs">
                    {redirect
                        ? 'Redirects are not followed. Use the final URL.'
                        : 'On a call, the agent would say it could not do that right now.'}
                </p>
            ) : null}
            {result.body ? (
                <pre
                    className="bg-background max-h-48 overflow-auto rounded border p-2 font-mono text-xs break-all whitespace-pre-wrap"
                    data-testid="tool-test-body"
                >
                    {result.body}
                </pre>
            ) : result.status !== null ? (
                <p className="text-muted-foreground text-xs">The answer was empty.</p>
            ) : null}
            <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer select-none">
                    What was sent{result.signed ? ' (signed with your secret)' : ''}
                </summary>
                <pre className="bg-background mt-2 max-h-48 overflow-auto rounded border p-2 font-mono break-all whitespace-pre-wrap">
                    {result.sent}
                </pre>
            </details>
        </div>
    );
}

type WebhookToolDialogProps = {
    agentId: string;
    open: boolean;
    /** The tool being edited, or null to add one. */
    tool: VoiceAgentWebhookToolView | null;
    /** Names of the agent's other custom tools (names are unique per agent). */
    otherNames: string[];
    onOpenChange: (open: boolean) => void;
    onSaved: (agent: VoiceAgent) => void;
};

/** Add or edit a custom tool, and send it a test request before saving. */
export function WebhookToolDialog({ agentId, open, tool, otherNames, onOpenChange, onSaved }: WebhookToolDialogProps) {
    const initial = useMemo(() => toolToDraft(tool), [tool]);
    const [draft, setDraft] = useState<WebhookToolDraft>(initial);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<VoiceWebhookTestResult | null>(null);

    // A fresh form each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setDraft(initial);
        setError(null);
        setTestResult(null);
    }, [open, initial]);

    const dirty = !sameDraft(draft, initial);
    const busy = saving || testing;
    const set = (patch: Partial<WebhookToolDraft>) => setDraft((d) => ({ ...d, ...patch }));

    const close = (next: boolean) => {
        if (!next && saving) return;
        onOpenChange(next);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const problem = webhookDraftError(draft, otherNames);
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        setSaving(true);
        const input = draftToInput(draft);
        const response = tool
            ? await updateVoiceAgentWebhookTool(agentId, tool.id, input)
            : await createVoiceAgentWebhookTool(agentId, input);
        setSaving(false);
        if (!response.success || !response.data) {
            setError(response.error ?? 'Could not save the tool');
            return;
        }
        onSaved(response.data);
        toast.success(tool ? 'Tool saved' : 'Tool added');
        onOpenChange(false);
    };

    const sendTest = async () => {
        const problem = webhookDraftError(draft, otherNames, true);
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        setTesting(true);
        setTestResult(null);
        const response = await sendVoiceAgentWebhookTest(agentId, { toolId: tool?.id ?? null, tool: draftToInput(draft) });
        setTesting(false);
        if (!response.success || !response.data) {
            setError(response.error ?? 'Could not send the test request');
            return;
        }
        setTestResult(response.data);
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent
                className="sm:max-w-2xl"
                onInteractOutside={(e) => {
                    // A stray click should not throw away a half-written tool.
                    if (dirty || busy) e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{tool ? `Edit ${tool.name}` : 'Add a custom tool'}</DialogTitle>
                    <DialogDescription>
                        During a call the agent can send what it collected to your URL and read the answer back to the
                        caller.
                    </DialogDescription>
                </DialogHeader>

                <form id="webhook-tool-form" onSubmit={submit} className="grid min-w-0 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="tool-name">Name</Label>
                        <Input
                            id="tool-name"
                            value={draft.name}
                            onChange={(e) => set({ name: e.target.value })}
                            placeholder="check_order"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={40}
                            disabled={busy}
                            className="font-mono text-base md:text-[13px]"
                        />
                        <p className="text-muted-foreground text-xs">
                            Lowercase letters, numbers and _. The agent sees this name.
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="tool-description">When should the agent use this?</Label>
                        <Textarea
                            id="tool-description"
                            value={draft.description}
                            onChange={(e) => set({ description: e.target.value })}
                            placeholder="When the caller asks where their order is. Ask for the order number first."
                            maxLength={VOICE_WEBHOOK_LIMITS.descriptionMax}
                            disabled={busy}
                            className="min-h-20"
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="tool-url">URL</Label>
                        <Input
                            id="tool-url"
                            type="url"
                            inputMode="url"
                            value={draft.url}
                            onChange={(e) => set({ url: e.target.value })}
                            placeholder="https://example.com/hooks/check-order"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={VOICE_WEBHOOK_LIMITS.urlMax}
                            disabled={busy}
                        />
                        <p className="text-muted-foreground text-xs">
                            We send a POST with JSON and wait up to {VOICE_WEBHOOK_LIMITS.timeoutMs / 1000} seconds for
                            the answer.
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <p className="text-sm leading-none font-medium">Parameters</p>
                        <WebhookParamRows params={draft.params} onChange={(params) => set({ params })} disabled={busy} />
                    </div>

                    <div className="grid gap-2" data-testid="tool-secret">
                        <Label htmlFor="tool-secret">
                            Signing secret <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        {draft.secretMode === 'keep' ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-sm" data-testid="tool-secret-set">
                                    <KeyRound className="text-muted-foreground size-4" />
                                    Secret set
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => set({ secretMode: 'set', secretValue: '' })}
                                    disabled={busy}
                                >
                                    Replace
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => set({ secretMode: 'clear' })}
                                    disabled={busy}
                                >
                                    Remove
                                </Button>
                            </div>
                        ) : draft.secretMode === 'clear' ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm">The secret is removed when you save.</span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => set({ secretMode: 'keep' })}
                                    disabled={busy}
                                >
                                    Keep it
                                </Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Input
                                    id="tool-secret"
                                    type="password"
                                    value={draft.secretValue}
                                    onChange={(e) => set({ secretValue: e.target.value })}
                                    placeholder={draft.hasSecret ? 'New secret' : 'Leave empty to send unsigned requests'}
                                    autoComplete="new-password"
                                    maxLength={VOICE_WEBHOOK_LIMITS.secretMax}
                                    disabled={busy}
                                    className="min-w-0 flex-1"
                                />
                                {draft.hasSecret ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => set({ secretMode: 'keep', secretValue: '' })}
                                        disabled={busy}
                                    >
                                        Cancel
                                    </Button>
                                ) : null}
                            </div>
                        )}
                        <p className="text-muted-foreground text-xs">
                            With a secret, each request carries{' '}
                            <code className="font-mono">X-Aixel-Signature: sha256=…</code>, an HMAC-SHA256 of the body,
                            so your server can tell it came from us. It is never shown again.
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="justify-self-start"
                            onClick={() => void sendTest()}
                            disabled={busy}
                        >
                            {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            {testing ? 'Sending…' : 'Send test request'}
                        </Button>
                        <p className="text-muted-foreground text-xs">
                            Sends example values for each parameter, exactly as a call would. Nothing is saved.
                        </p>
                        {testResult ? <TestResult result={testResult} /> : null}
                    </div>
                </form>

                {error ? (
                    <p className="text-destructive text-sm" role="alert" data-testid="tool-error">
                        {error}
                    </p>
                ) : null}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button type="submit" form="webhook-tool-form" disabled={busy || (!!tool && !dirty)}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                        {tool ? 'Save tool' : 'Add tool'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
