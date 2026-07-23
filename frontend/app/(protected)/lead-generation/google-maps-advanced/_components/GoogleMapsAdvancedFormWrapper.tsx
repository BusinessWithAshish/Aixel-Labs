'use client';

import { FormProvider } from 'react-hook-form';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { LeadFormWrapper } from '@/components/common/LeadFormWrappers';
import { FormPresetScraperActions } from '@/components/common/FormPresetScraperActions';
import { PageProvider, usePage } from '@/contexts/PageStore';
import {
    useGoogleMapsAdvancedForm,
    type UseGoogleMapsAdvancedFormReturn,
} from '../_hooks/use-google-maps-advanced-form';
import { GOOGLE_MAPS_ADVANCED_FORM_NAME } from '../_constants';
import { GoogleMapsAdvancedUrlsForm } from './GoogleMapsAdvancedUrlsForm';

const GoogleMapsAdvancedFormInner = () => {
    const { form, onSubmit } = usePage<UseGoogleMapsAdvancedFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Google Maps Advanced',
                    description: 'Get detailed place data from Google Maps place URLs',
                    icon: { src: '/google-maps.svg', alt: 'Google Maps' },
                }}
                creditModule={LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED}
                        onSubmit={onSubmit}
                    />
                }
            >
                <form
                    className="h-full w-full space-y-3"
                    id={GOOGLE_MAPS_ADVANCED_FORM_NAME}
                    onSubmit={form.handleSubmit(onSubmit)}
                >
                    <GoogleMapsAdvancedUrlsForm />
                </form>
            </LeadFormWrapper>
        </FormProvider>
    );
};

/** Self-contained form (own PageProvider) — safe to embed on Maps URLs tab. */
export const GoogleMapsAdvancedFormWrapper = () => {
    return (
        <PageProvider usePageHook={useGoogleMapsAdvancedForm}>
            <GoogleMapsAdvancedFormInner />
        </PageProvider>
    );
};
