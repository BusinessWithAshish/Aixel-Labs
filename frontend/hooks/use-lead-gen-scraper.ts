'use client';

import { useCallback } from 'react';
import { LEAD_GENERATION_SUB_MODULES, UserLead } from '@aixellabs/backend/db/types';
import { createUserLeads } from '@/app/actions/user-lead-actions';
import { toast } from 'sonner';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import useLocalStorageState from 'use-local-storage-state';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';

const LEADS_OVERVIEW_PATH = '/lead-generation/leads';

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
    onSuccess?: (result: ALApiResponse<UserLead[]>) => void;
};

/**
 * Lead-gen scraper forms: in-memory loading state scoped by submodule hook instance.
 */
export function useLeadGenScraper(subModule: LEAD_GENERATION_SUB_MODULES) {
    const key = generateLocalStorageKey('lead-gen-scraper-loading', subModule);
    const [loading, setLoading] = useLocalStorageState(key, { defaultValue: false });

    const submitLeadGenScraperForm = useCallback(
        async <TRequest>(options: SubmitLeadGenScraperFormOptions<TRequest>): Promise<boolean> => {
            const { body, errorMessage } = options;

            setLoading(true);
            try {
                const result = await createUserLeads(subModule, body);

                if (!result.success || !result.data?.length) {
                    setLoading(false);
                    toast.error(result.error ?? errorMessage ?? 'Failed to generate leads');
                    return false;
                }

                toast.success(defaultSuccessToast.message, {
                    ...defaultSuccessToast.options,
                    description: `Saved ${result.data.length} leads. ${defaultSuccessToast.options.description}`,
                });

                options.onSuccess?.(result);

                return true;
            } finally {
                setLoading(false);
            }
        },
        [subModule, setLoading],
    );

    return { submitLeadGenScraperForm, loading };
}
