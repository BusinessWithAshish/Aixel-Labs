'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useMemo } from 'react';
import type { INSTAGRAM_REQUEST } from '@aixellabs/backend/instagram';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import { INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT } from '@aixellabs/backend/instagram/constants';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { City, Country, ICity, IState, State } from 'country-state-city';
import { OptionType } from '@/components/ui/searchable-select';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';

const DEFAULT_FORM_VALUES: INSTAGRAM_REQUEST = {
    entities: [],
    query: '',
    country: '',
    state: '',
    city: '',
    hashtags: [],
    keywords: [],
    excludeHashtags: [],
    excludeKeywords: [],
    limit: INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT,
};

export const useInstagramForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(
        LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
    );

    const form = useForm<INSTAGRAM_REQUEST>({
        resolver: zodResolver(INSTAGRAM_REQUEST_SCHEMA) as Resolver<INSTAGRAM_REQUEST>,
        defaultValues: DEFAULT_FORM_VALUES,
    });

    const onSubmit = async (data: INSTAGRAM_REQUEST) => {
        await submitLeadGenScraperForm({
            body: data,
            onSuccess: () => {
                form.reset(DEFAULT_FORM_VALUES);
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
        isStateFieldDisabled,
        isCityFieldDisabled,
        cityOptions,
        onSubmit,
    };
};

export type UseInstagramFormReturn = ReturnType<typeof useInstagramForm>;
