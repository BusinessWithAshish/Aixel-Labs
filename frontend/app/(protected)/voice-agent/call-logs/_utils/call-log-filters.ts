import type { CallKindFilter, CallSuccessFilter } from '@/app/actions/voice-call-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { parseCallRange, type VoiceCallRange } from '@/helpers/voice-call-ranges';

/** Call logs' filters. They live in the URL (`?agent=&deleted=1&kind=&success=&range=&q=`), so a view can be reloaded and shared. */
export type CallLogFilters = {
    agent: string | null;
    /** Calls of agents deleted since show too. */
    deleted: boolean;
    kind: CallKindFilter | null;
    /** Calls the analysis judged successful or not. */
    success: CallSuccessFilter | null;
    range: VoiceCallRange;
    q: string;
};

export const NO_CALL_LOG_FILTERS: CallLogFilters = {
    agent: null,
    deleted: false,
    kind: null,
    success: null,
    range: 'all',
    q: '',
};

export const KIND_OPTIONS: { value: CallKindFilter; label: string }[] = [
    { value: 'inbound', label: 'Inbound' },
    { value: 'outbound', label: 'Outbound' },
    { value: 'playground', label: 'Playground' },
    { value: 'test', label: 'Test calls' },
];

export const SUCCESS_OPTIONS: { value: CallSuccessFilter; label: string }[] = [
    { value: 'yes', label: 'Successful' },
    { value: 'no', label: 'Not successful' },
];

type SearchParams = Record<string, string | string[] | undefined>;

/** The URL's filters; anything unknown is dropped. */
export function parseCallLogFilters(params: SearchParams): CallLogFilters {
    const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : '');
    return {
        agent: isValidObjectId(one('agent')) ? one('agent') : null,
        deleted: one('deleted') === '1',
        kind: KIND_OPTIONS.find((o) => o.value === one('kind'))?.value ?? null,
        success: SUCCESS_OPTIONS.find((o) => o.value === one('success'))?.value ?? null,
        range: parseCallRange(one('range')) ?? NO_CALL_LOG_FILTERS.range,
        q: one('q').trim(),
    };
}

/** The filters as a query string, defaults left out ("" when none is set). */
export function callLogFiltersQuery(filters: CallLogFilters): string {
    const params = new URLSearchParams();
    if (filters.agent) params.set('agent', filters.agent);
    if (filters.deleted) params.set('deleted', '1');
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.success) params.set('success', filters.success);
    if (filters.range !== NO_CALL_LOG_FILTERS.range) params.set('range', filters.range);
    if (filters.q) params.set('q', filters.q);
    return params.toString();
}
