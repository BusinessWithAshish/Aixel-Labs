'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { GMAPS_ADVANCED_REQUEST } from '@aixellabs/backend/gmaps/advanced';
import { GMAPS_ADVANCED_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps/advanced/schemas';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';
import { DEFAULT_GOOGLE_MAPS_ADVANCED_FORM_VALUES } from '../_constants';

export const useGoogleMapsAdvancedForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(
        LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED,
    );

    const form = useForm<GMAPS_ADVANCED_REQUEST>({
        resolver: zodResolver(GMAPS_ADVANCED_REQUEST_SCHEMA),
        defaultValues: DEFAULT_GOOGLE_MAPS_ADVANCED_FORM_VALUES,
    });

    const onSubmit = async (data: GMAPS_ADVANCED_REQUEST) => {
        await submitLeadGenScraperForm({
            body: data,
            onSuccess: () => {
                form.reset(DEFAULT_GOOGLE_MAPS_ADVANCED_FORM_VALUES);
            },
        });
    };

    return {
        form,
        onSubmit,
    };
};

export type UseGoogleMapsAdvancedFormReturn = ReturnType<typeof useGoogleMapsAdvancedForm>;
