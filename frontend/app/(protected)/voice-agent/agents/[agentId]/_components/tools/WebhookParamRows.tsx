'use client';

import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { VOICE_WEBHOOK_LIMITS, VOICE_WEBHOOK_PARAM_TYPES } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICE_WEBHOOK_PARAM_TYPE_LABELS } from '@/helpers/voice-agent-defaults';
import type { WebhookToolFormValues } from '@/helpers/voice-schemas';
import { NEW_WEBHOOK_PARAM } from '../../_utils/webhook-tool-form';

/** What the agent collects from the caller and sends: name, type, required, and a hint for the agent. */
export function WebhookParamRows({ disabled }: { disabled?: boolean }) {
    const { control, register } = useFormContext<WebhookToolFormValues>();
    const params = useFieldArray({ control, name: 'parameters' });
    const atLimit = params.fields.length >= VOICE_WEBHOOK_LIMITS.maxParams;

    return (
        <div className="grid gap-2" data-testid="tool-params">
            {params.fields.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    No parameters. The agent calls the URL with nothing from the caller.
                </p>
            ) : (
                <ul className="grid gap-2">
                    {params.fields.map((param, index) => {
                        const n = index + 1;
                        const requiredId = `tool-param-${param.id}-required`;
                        return (
                            <li
                                key={param.id}
                                className="bg-muted/30 grid gap-2 rounded-md border p-2"
                                data-testid="tool-param"
                            >
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="order_id"
                                        aria-label={`Parameter ${n} name`}
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="h-8 min-w-0 flex-1 font-mono text-base md:text-[13px]"
                                        {...register(`parameters.${index}.name`)}
                                    />
                                    <Controller
                                        control={control}
                                        name={`parameters.${index}.type`}
                                        render={({ field }) => (
                                            <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                                                <SelectTrigger
                                                    size="sm"
                                                    className="w-28 shrink-0"
                                                    aria-label={`Parameter ${n} type`}
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {VOICE_WEBHOOK_PARAM_TYPES.map((type) => (
                                                        <SelectItem key={type} value={type}>
                                                            {VOICE_WEBHOOK_PARAM_TYPE_LABELS[type]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0"
                                        onClick={() => params.remove(index)}
                                        disabled={disabled}
                                        aria-label={`Remove parameter ${n}`}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Input
                                        placeholder="What it means, for the agent"
                                        aria-label={`Parameter ${n} description`}
                                        maxLength={VOICE_WEBHOOK_LIMITS.paramDescriptionMax}
                                        className="h-8 min-w-0 flex-1"
                                        {...register(`parameters.${index}.description`)}
                                    />
                                    <Controller
                                        control={control}
                                        name={`parameters.${index}.required`}
                                        render={({ field }) => (
                                            <Checkbox
                                                id={requiredId}
                                                checked={field.value}
                                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                                disabled={disabled}
                                                aria-label={`Parameter ${n} required`}
                                            />
                                        )}
                                    />
                                    <Label htmlFor={requiredId} className="-ml-1.5 shrink-0 text-xs font-normal">
                                        Required
                                    </Label>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => params.append({ ...NEW_WEBHOOK_PARAM })}
                disabled={disabled || atLimit}
            >
                <Plus className="size-4" />
                {atLimit ? `Up to ${VOICE_WEBHOOK_LIMITS.maxParams} parameters` : 'Add parameter'}
            </Button>
        </div>
    );
}
