'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, type VoiceAgent, type VoiceAgentWebhookToolView } from '@aixellabs/backend/db/types';
import {
    createVoiceAgentWebhookTool,
    sendVoiceAgentWebhookTest,
    updateVoiceAgentWebhookTool,
    type VoiceWebhookTestResult,
} from '@/app/actions/voice-agent-actions';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ZodMetaType } from '@/components/common/zod-form-builder/zod-meta-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    schemaProblem,
    webhookSecretInput,
    webhookTestSchema,
    webhookToolFormSchema,
    type WebhookToolFormValues,
} from '@/helpers/voice-schemas';
import { cn } from '@/lib/utils';
import { webhookToolFormValues } from '../../_utils/webhook-tool-form';
import { WebhookParamRows } from './WebhookParamRows';

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

/** The signing secret: set (kept), about to be removed, or a new one typed in. It is never shown. */
function SecretField({ hasSecret, disabled }: { hasSecret: boolean; disabled: boolean }) {
    const form = useFormContext<WebhookToolFormValues>();
    const action = form.watch('secret.action');
    const setAction = (next: WebhookToolFormValues['secret']['action']) =>
        form.setValue('secret', { action: next, value: '' }, { shouldDirty: true });

    return (
        <Field data-testid="tool-secret">
            <FieldLabel htmlFor="tool-secret">
                Signing secret <span className="text-muted-foreground font-normal">(optional)</span>
            </FieldLabel>
            {action === 'keep' ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm" data-testid="tool-secret-set">
                        <KeyRound className="text-muted-foreground size-4" />
                        Secret set
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setAction('set')} disabled={disabled}>
                        Replace
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setAction('clear')}
                        disabled={disabled}
                    >
                        Remove
                    </Button>
                </div>
            ) : action === 'clear' ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">The secret is removed when you save.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setAction('keep')} disabled={disabled}>
                        Keep it
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Input
                        id="tool-secret"
                        type="password"
                        placeholder={hasSecret ? 'New secret' : 'Leave empty to send unsigned requests'}
                        autoComplete="new-password"
                        maxLength={VOICE_WEBHOOK_LIMITS.secretMax}
                        className="min-w-0 flex-1"
                        {...form.register('secret.value')}
                    />
                    {hasSecret ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAction('keep')}
                            disabled={disabled}
                        >
                            Cancel
                        </Button>
                    ) : null}
                </div>
            )}
            <FieldDescription className="text-xs">
                With a secret, each request carries <code className="font-mono">X-Aixel-Signature: sha256=…</code>, an
                HMAC-SHA256 of the body, so your server can tell it came from us. It is never shown again.
            </FieldDescription>
        </Field>
    );
}

/** Add or edit a custom tool, and send it a test request before saving. */
export function WebhookToolDialog({ agentId, open, tool, otherNames, onOpenChange, onSaved }: WebhookToolDialogProps) {
    const hasSecret = tool?.hasSecret ?? false;
    const namesKey = otherNames.join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the names change, not the array
    const schema = useMemo(() => webhookToolFormSchema(hasSecret, otherNames), [hasSecret, namesKey]);
    const form = useForm({ resolver: zodResolver(schema), defaultValues: webhookToolFormValues(tool) });
    const [error, setError] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<VoiceWebhookTestResult | null>(null);
    const saving = form.formState.isSubmitting;
    const dirty = form.formState.isDirty;
    const busy = saving || testing;

    // A fresh form each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        form.reset(webhookToolFormValues(tool));
        setError(null);
        setTestResult(null);
    }, [open, tool, form]);

    const close = (next: boolean) => {
        if (!next && saving) return;
        onOpenChange(next);
    };

    const submit = form.handleSubmit(
        async (input) => {
            setError(null);
            const response = tool
                ? await updateVoiceAgentWebhookTool(agentId, tool.id, input)
                : await createVoiceAgentWebhookTool(agentId, input);
            if (!response.success || !response.data) {
                setError(response.error ?? 'Could not save the tool');
                return;
            }
            onSaved(response.data);
            toast.success(tool ? 'Tool saved' : 'Tool added');
            onOpenChange(false);
        },
        () => setError(schemaProblem(schema, form.getValues())),
    );

    /** A test needs a working name, URL and parameters, not the description yet. */
    const sendTest = async () => {
        const { name, url, parameters, secret } = form.getValues();
        const input = { name, url, parameters, secret: webhookSecretInput(secret) };
        const problem = schemaProblem(webhookTestSchema, input);
        setError(problem);
        if (problem) return;
        setTesting(true);
        setTestResult(null);
        const response = await sendVoiceAgentWebhookTest(agentId, { toolId: tool?.id ?? null, tool: input });
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

                <FormProvider {...form}>
                    <form id="webhook-tool-form" onSubmit={submit} className="grid min-w-0 gap-4" noValidate>
                        <StringControlledField
                            name="name"
                            id="tool-name"
                            label="Name"
                            placeholder="check_order"
                            description="Lowercase letters, numbers and _. The agent sees this name."
                            classNames={{ input: 'font-mono text-base md:text-[13px]', description: 'text-xs' }}
                            inputProps={{ autoComplete: 'off', spellCheck: false, maxLength: 40 }}
                        />
                        <StringControlledField
                            name="description"
                            id="tool-description"
                            label="When should the agent use this?"
                            metadata={ZodMetaType.TEXT_AREA}
                            placeholder="When the caller asks where their order is. Ask for the order number first."
                            classNames={{ input: 'min-h-20' }}
                        />
                        <StringControlledField
                            name="url"
                            id="tool-url"
                            label="URL"
                            type="url"
                            placeholder="https://example.com/hooks/check-order"
                            description={`We send a POST with JSON and wait up to ${VOICE_WEBHOOK_LIMITS.timeoutMs / 1000} seconds for the answer.`}
                            classNames={{ description: 'text-xs' }}
                            inputProps={{
                                inputMode: 'url',
                                autoComplete: 'off',
                                spellCheck: false,
                                maxLength: VOICE_WEBHOOK_LIMITS.urlMax,
                            }}
                        />

                        <Field>
                            <FieldTitle>Parameters</FieldTitle>
                            <WebhookParamRows disabled={busy} />
                        </Field>

                        <SecretField hasSecret={hasSecret} disabled={busy} />

                        <Field>
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
                            <FieldDescription className="text-xs">
                                Sends example values for each parameter, exactly as a call would. Nothing is saved.
                            </FieldDescription>
                            {testResult ? <TestResult result={testResult} /> : null}
                        </Field>
                    </form>
                </FormProvider>

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
