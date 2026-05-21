'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { City, Country, State } from 'country-state-city';
import { useEffect, useMemo } from 'react';
import { GMAPS_REQUEST_SCHEMA as GMAPS_INTERNAL_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import type { GMAPS_INTERNAL_REQUEST } from '@aixellabs/backend/gmaps/internal/types';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';

const DEFAULT_FORM_VALUES: GMAPS_INTERNAL_REQUEST = {
    query: '',
    country: '',
    countryCode: '',
    state: '',
    cities: [],
    urls: [],
};

const countries = Country.getAllCountries();
const countryOptions = countries.map((country) => ({
    label: country.name,
    value: country.isoCode,
}));

export const useGoogleMapsForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS);

    const form = useForm<GMAPS_INTERNAL_REQUEST>({
        resolver: zodResolver(GMAPS_INTERNAL_REQUEST_SCHEMA),
        defaultValues: DEFAULT_FORM_VALUES,
    });

    const selectedCountry = form.watch('country');
    const selectedState = form.watch('state');

    const stateOptions = useMemo(() => {
        if (!selectedCountry) return [];
        return State.getStatesOfCountry(selectedCountry).map((s) => ({
            label: s.name,
            value: s.isoCode,
        }));
    }, [selectedCountry]);

    const cityOptions = useMemo(() => {
        if (!selectedCountry || !selectedState) return [];
        return City.getCitiesOfState(selectedCountry, selectedState).map((city) => ({
            label: city.name,
            value: city.name,
        }));
    }, [selectedCountry, selectedState]);

    const selectedCountryISOCode = useMemo(() => {
        if (!selectedCountry) return undefined;
        return Country.getCountryByCode(selectedCountry)?.isoCode;
    }, [selectedCountry]);

    useEffect(() => {
        if (!selectedCountryISOCode) return;
        form.setValue('countryCode', selectedCountryISOCode);
    }, [selectedCountryISOCode, form]);

    const isStateFieldDisabled = !selectedCountry;
    const isCityFieldDisabled = !selectedCountry || !selectedState;

    const onSubmit = (data: GMAPS_INTERNAL_REQUEST) =>
        submitLeadGenScraperForm({
            body: data,
            onSuccess: () => form.reset(DEFAULT_FORM_VALUES),
        });

    return {
        form,
        onSubmit,
        countryOptions,
        stateOptions,
        cityOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    };
};

export type UseGoogleMapsFormReturn = ReturnType<typeof useGoogleMapsForm>;
