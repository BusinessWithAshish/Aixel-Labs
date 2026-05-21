'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import type { INSTAGRAM_REQUEST } from '@aixellabs/backend/instagram';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { City, Country, ICity, IState, State } from 'country-state-city';
import { OptionType } from '@/components/ui/searchable-select';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';

const DEFAULT_FORM_VALUES: INSTAGRAM_REQUEST = {
    entities: [],
    query: '',
    country: '',
    city: '',
    hashtags: [],
    keywords: [],
    excludeHashtags: [],
    excludeKeywords: [],
};

export const useInstagramForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH);

    // state is not part of schema, so we need to handle it separately
    const [selectedState, setSelectedState] = useState<string | undefined>(undefined);

    const form = useForm<INSTAGRAM_REQUEST>({
        resolver: zodResolver(INSTAGRAM_REQUEST_SCHEMA),
        defaultValues: DEFAULT_FORM_VALUES,
    });

    const onSubmit = async (data: INSTAGRAM_REQUEST) => {
        await submitLeadGenScraperForm({
            body: data,
            onSuccess: () => {
                form.reset(DEFAULT_FORM_VALUES);
                setSelectedState(undefined);
            },
        });
    };

    const countries = Country.getAllCountries();
    const countryOptions = countries.map((country) => ({
        label: country.name,
        value: country.isoCode,
    }));

    const selectedCountry = form.watch('country');

    const stateOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry) return [];
        return (
            State.getStatesOfCountry(selectedCountry)?.map((state: IState) => ({
                label: state.name,
                value: state.isoCode,
            })) || []
        );
    }, [selectedCountry]);

    const cityOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry || !selectedState) return [];
        return (
            City.getCitiesOfState(selectedCountry, selectedState)?.map((city: ICity) => ({
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
        selectedState,
        setSelectedState,
        isStateFieldDisabled,
        isCityFieldDisabled,
        cityOptions,
        onSubmit,
    };
};

export type UseInstagramFormReturn = ReturnType<typeof useInstagramForm>;
