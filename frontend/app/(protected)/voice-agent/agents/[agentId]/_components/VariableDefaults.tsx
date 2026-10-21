'use client';

import { TriangleAlert } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VOICE_BUILTIN_VARIABLES } from '@aixellabs/backend/db/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePage } from '@/contexts/PageStore';
import { VOICE_BUILTIN_VARIABLE_INFO } from '@/helpers/voice-agent-features';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/**
 * Default values for the custom `{{variables}}` the prompt, call notes and voicemail message use.
 * A call's own value (a campaign column, a test call) wins; built-ins are filled in on every call.
 */
export function VariableDefaults() {
    const { agentForm, form, usedVariables } = usePage<UseVoiceAgentEditorPageReturn>();

    return (
        <div id="agent-variables" className="grid scroll-mt-4 gap-2" data-testid="agent-variables">
            <p className="text-sm leading-none font-medium">Variables</p>
            <p className="text-muted-foreground text-xs">
                Write <code className="font-mono">{'{{name}}'}</code> in the prompt or call notes (type{' '}
                <code className="font-mono">{'{{'}</code> for the list). Each call fills it in from its own values (a
                campaign&rsquo;s CSV columns, a test call&rsquo;s), else the default below; with neither it is left empty.
            </p>

            {usedVariables.length > 0 ? (
                <ul className="divide-y rounded-md border">
                    {usedVariables.map((name) => {
                        const value = form.variables[name] ?? '';
                        const inputId = `variable-${name}`;
                        return (
                            <li
                                key={name}
                                className="grid gap-1.5 px-3 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-center sm:gap-3"
                                data-testid="agent-variable"
                                data-variable={name}
                            >
                                <Label htmlFor={inputId} className="min-w-0 font-mono text-[13px] font-normal break-all">
                                    {`{{${name}}}`}
                                    {value.trim() ? null : (
                                        <TriangleAlert
                                            className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                                            aria-label="No default value"
                                        />
                                    )}
                                </Label>
                                <Input
                                    id={inputId}
                                    maxLength={VOICE_AGENT_FEATURE_LIMITS.maxVariableLength}
                                    placeholder="Default value (optional)"
                                    {...agentForm.register(`variables.${name}`)}
                                    className="h-8"
                                />
                            </li>
                        );
                    })}
                </ul>
            ) : null}

            <details className="text-muted-foreground text-xs">
                <summary className="w-fit cursor-pointer select-none">Built-in variables</summary>
                <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
                    {VOICE_BUILTIN_VARIABLES.map((name) => (
                        <div key={name} className="contents">
                            <dt className="text-foreground font-mono">{`{{${name}}}`}</dt>
                            <dd className="mb-1 sm:mb-0">{VOICE_BUILTIN_VARIABLE_INFO[name]}</dd>
                        </div>
                    ))}
                </dl>
            </details>
        </div>
    );
}
