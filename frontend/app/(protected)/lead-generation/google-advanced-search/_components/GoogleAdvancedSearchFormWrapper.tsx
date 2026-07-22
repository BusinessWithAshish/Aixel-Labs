'use client';

import { FormProvider } from 'react-hook-form';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';
import type { UseGoogleAdvancedSearchFormReturn } from '../_hooks/use-google-advanced-search-form';
import { GOOGLE_ADVANCED_SEARCH_FORM_NAME } from '../_constants';
import { GoogleAdvancedSearchQueryForm } from './GoogleAdvancedSearchQueryForm';

export const GoogleAdvancedSearchFormWrapper = () => {
    const { form, onSubmit } = usePage<UseGoogleAdvancedSearchFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Google Advanced Search Form',
                    description: 'Search the web with location and time filters to find leads',
                    icon: { src: '/google-logo.png', alt: 'Google' },
                }}
                creditModule={LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH}
                        onSubmit={onSubmit}
                    />
                }
            >
                <form
                    className="h-full w-full space-y-3"
                    id={GOOGLE_ADVANCED_SEARCH_FORM_NAME}
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <GoogleAdvancedSearchQueryForm />
                </form>
            </LeadFormWrapper>
        </FormProvider>
    );
};
