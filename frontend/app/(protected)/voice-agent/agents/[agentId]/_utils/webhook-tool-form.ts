import type { VoiceAgentWebhookToolView, VoiceWebhookParam } from '@aixellabs/backend/db/types';
import type { WebhookToolFormValues } from '@/helpers/voice-schemas';

/** A parameter row as added in the dialog. */
export const NEW_WEBHOOK_PARAM: VoiceWebhookParam = { name: '', type: 'string', required: true, description: '' };

/** The dialog's starting values: the saved tool, or an empty one. A saved secret is kept unless replaced. */
export function webhookToolFormValues(tool: VoiceAgentWebhookToolView | null): WebhookToolFormValues {
    return {
        name: tool?.name ?? '',
        description: tool?.description ?? '',
        url: tool?.url ?? '',
        parameters: (tool?.parameters ?? []).map((p) => ({ ...p })),
        enabled: tool?.enabled ?? true,
        secret: { action: tool?.hasSecret ? 'keep' : 'set', value: '' },
    };
}

/** "api.example.com" from a URL, or the text as typed when it is not one yet. */
export function urlHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
