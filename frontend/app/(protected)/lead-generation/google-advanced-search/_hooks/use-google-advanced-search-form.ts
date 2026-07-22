'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useMemo } from 'react';
import { City, Country, type ICity, type IState, State } from 'country-state-city';
import type { OptionType } from '@/components/ui/searchable-select';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { GSEARCH_REQUEST_SCHEMA } from '@aixellabs/backend/gsearch/schemas';
import type { GSEARCH_REQUEST } from '@aixellabs/backend/gsearch/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';
import { DEFAULT_GOOGLE_ADVANCED_SEARCH_FORM_VALUES } from '../_constants';

export const useGoogleAdvancedSearchForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(
        LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
    );

    const form = useForm<GSEARCH_REQUEST>({
        resolver: zodResolver(GSEARCH_REQUEST_SCHEMA) as Resolver<GSEARCH_REQUEST>,
        defaultValues: DEFAULT_GOOGLE_ADVANCED_SEARCH_FORM_VALUES,
    });

    const onSubmit = async (data: GSEARCH_REQUEST) => {
        await submitLeadGenScraperForm({
            body: data,
            onSuccess: () => {
                form.reset(DEFAULT_GOOGLE_ADVANCED_SEARCH_FORM_VALUES);
            },
        });
    };

    const countries = Country.getAllCountries();
    const countryOptions = countries.map((country) => ({
        label: country.name,
        value: country.isoCode,
    }));

    const selectedCountry = form.watch('country');
    const selectedState = form.watch('state');

    const stateOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry) return [];
        return (
            State.getStatesOfCountry(selectedCountry)?.map((state: IState) => ({
                label: state.name,
                value: state.name,
            })) || []
        );
    }, [selectedCountry]);

    const cityOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry || !selectedState) return [];
        const stateIso = State.getStatesOfCountry(selectedCountry)?.find(
            (s: IState) => s.name === selectedState,
        )?.isoCode;
        if (!stateIso) return [];
        return (
            City.getCitiesOfState(selectedCountry, stateIso)?.map((city: ICity) => ({
                label: city?.name || '',
                value: city.name,
            })) || []
        );
    }, [selectedCountry, selectedState]);

    const isStateFieldDisabled = !selectedCountry;
    const isCityFieldDisabled = !selectedCountry || !selectedState;

    return {
        form,
        countryOptions,
        stateOptions,
        cityOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
        onSubmit,
    };
};

export type UseGoogleAdvancedSearchFormReturn = ReturnType<typeof useGoogleAdvancedSearchForm>;
