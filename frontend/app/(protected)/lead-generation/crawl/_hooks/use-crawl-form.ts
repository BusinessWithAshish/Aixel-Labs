'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CRAWL_REQUEST_SCHEMA } from '@aixellabs/backend/crawl/schemas';
import type { CRAWL_REQUEST } from '@aixellabs/backend/crawl/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';
import { DEFAULT_CRAWL_FORM_VALUES } from '../_constants';

export const useCrawlForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.CRAWL);

    const form = useForm<CRAWL_REQUEST>({
        resolver: zodResolver(CRAWL_REQUEST_SCHEMA) as Resolver<CRAWL_REQUEST>,
        defaultValues: DEFAULT_CRAWL_FORM_VALUES,
    });

    const onSubmit = async (data: CRAWL_REQUEST) => {
        const domains = (data.domains ?? []).map((d) => d.trim()).filter(Boolean);
        await submitLeadGenScraperForm({
            body: {
                ...data,
                domains,
            },
            onSuccess: () => {
                form.reset(DEFAULT_CRAWL_FORM_VALUES);
            },
        });
    };

    return {
        form,
        onSubmit,
    };
};

export type UseCrawlFormReturn = ReturnType<typeof useCrawlForm>;
