'use client';

import { useCallback } from 'react';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import {
    createUserLeads,
    type CreateUserLeadsResult,
} from '@/app/actions/user-lead-actions';
import { toast } from 'sonner';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import useLocalStorageState from 'use-local-storage-state';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
import { showCreditsExhaustedDialog } from '@/components/common/credits/CreditsExhaustedDialog';
import { setCreditsBadgeCache } from '@/components/common/credits/CreditsBadge';

const LEADS_OVERVIEW_PATH = '/lead-generation/leads';

/** Shared across hook instances for the same submodule (loading is also shared via localStorage). */
const abortControllers = new Map<LEAD_GENERATION_SUB_MODULES, AbortController>();
/** Set when abort is clicked before the in-flight submit has created a controller. */
const abortRequested = new Set<LEAD_GENERATION_SUB_MODULES>();

const defaultSuccessToast = {
    message: 'Your leads are ready.',
    options: {
        description: 'Open the leads overview to see them.',
        duration: 12_000,
        classNames: {
            actionButton: 'bg-primary text-primary-foreground hover:bg-primary/90',
        },
        action: {
            label: 'View leads',
            onClick: () => window.location.assign(LEADS_OVERVIEW_PATH),
        },
    },
};

export type SubmitLeadGenScraperFormOptions<TRequest> = {
    body: TRequest;
    errorMessage?: string;
    onSuccess?: (result: ALApiResponse<CreateUserLeadsResult>) => void;
};

function isAbortError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')
    );
}

/** Rejects as soon as `signal` aborts so the UI can unblock while the server action may still finish. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener('abort', onAbort);
                if (signal.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                resolve(value);
            },
            (err) => {
                signal.removeEventListener('abort', onAbort);
                reject(err);
            },
        );
    });
}

/**
 * Lead-gen scraper forms: in-memory loading state scoped by submodule hook instance.
 */
export function useLeadGenScraper(subModule: LEAD_GENERATION_SUB_MODULES) {
    const key = generateLocalStorageKey('lead-gen-scraper-loading', subModule);
    const [loading, setLoading] = useLocalStorageState(key, { defaultValue: false });

    const abortRequest = useCallback(() => {
        const controller = abortControllers.get(subModule);
        if (!controller) {
            if (abortRequested.has(subModule)) return;
            // Form may be mid-submit (isSubmitting) before the scraper call starts.
            abortRequested.add(subModule);
        } else {
            controller.abort();
            abortControllers.delete(subModule);
        }
        setLoading(false);
        toast.info('Request cancelled.');
    }, [subModule, setLoading]);

    /** Clears a pending abort that was clicked before submit reached the scraper. */
    const clearPendingAbort = useCallback(() => {
        abortRequested.delete(subModule);
    }, [subModule]);

    const submitLeadGenScraperForm = useCallback(
        async <TRequest>(options: SubmitLeadGenScraperFormOptions<TRequest>): Promise<boolean> => {
            const { body, errorMessage } = options;

            if (abortRequested.has(subModule)) {
                abortRequested.delete(subModule);
                setLoading(false);
                return false;
            }

            abortControllers.get(subModule)?.abort();
            const controller = new AbortController();
            abortControllers.set(subModule, controller);

            setLoading(true);
            try {
                const result = await abortable(createUserLeads(subModule, body), controller.signal);

                if (controller.signal.aborted) {
                    return false;
                }

                if (!result.success || !result.data?.leads.length) {
                    toast.error(result.error ?? errorMessage ?? 'Failed to generate leads');
                    return false;
                }

                const { leads, remainingCredits } = result.data;
                setCreditsBadgeCache(remainingCredits);

                if (remainingCredits === 0) {
                    showCreditsExhaustedDialog(leads.length);
                } else {
                    toast.success(defaultSuccessToast.message, {
                        ...defaultSuccessToast.options,
                        description: `Saved ${leads.length} leads. ${defaultSuccessToast.options.description}`,
                    });
                }

                options.onSuccess?.(result);

                return true;
            } catch (error) {
                if (isAbortError(error) || controller.signal.aborted) {
                    return false;
                }
                toast.error(error instanceof Error ? error.message : (errorMessage ?? 'Failed to generate leads'));
                return false;
            } finally {
                if (abortControllers.get(subModule) === controller) {
                    abortControllers.delete(subModule);
                }
                setLoading(false);
            }
        },
        [subModule, setLoading],
    );

    return { submitLeadGenScraperForm, loading, abortRequest, clearPendingAbort };
}
