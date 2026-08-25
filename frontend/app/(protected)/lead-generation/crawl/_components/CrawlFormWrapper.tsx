'use client';

import { FormProvider } from 'react-hook-form';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';
import { Globe } from 'lucide-react';
import type { UseCrawlFormReturn } from '../_hooks/use-crawl-form';
import { CRAWL_FORM_NAME } from '../_constants';
import { CrawlQueryForm } from './CrawlQueryForm';

export const CrawlFormWrapper = () => {
    const { form, onSubmit } = usePage<UseCrawlFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Crawl Form',
                    description:
                        'Crawl company websites to extract published emails, phones, and social profiles',
                    icon: {
                        src: '',
                        alt: 'Crawl',
                        fallback: <Globe className="h-4 w-4" />,
                    },
                }}
                creditModule={LEAD_GENERATION_SUB_MODULES.CRAWL}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.CRAWL}
                        onSubmit={onSubmit}
                    />
                }
            >
                <form
                    className="h-full w-full space-y-3"
                    id={CRAWL_FORM_NAME}
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <CrawlQueryForm />
                </form>
            </LeadFormWrapper>
        </FormProvider>
    );
};
