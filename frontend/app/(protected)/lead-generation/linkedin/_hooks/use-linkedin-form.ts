'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { City, Country, ICity, IState, State } from 'country-state-city';
import { LINKEDIN_BY_COMPANY_REQUEST_SCHEMA, LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA } from '@aixellabs/backend/linkedin/schemas';
import type { LINKEDIN_BY_COMPANY_REQUEST, LINKEDIN_BY_PEOPLE_REQUEST } from '@aixellabs/backend/linkedin/types';
import type { OptionType } from '@/components/ui/searchable-select';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';

const LINKEDIN_BY_PEOPLE_DEFAULTS: LINKEDIN_BY_PEOPLE_REQUEST = {
    discovery_filters: {
        country: '',
        state: undefined,
        city: undefined,
        name: undefined,
        bio: undefined,
        job_titles: [],
        keywords: [],
        languages: undefined,
        companies: undefined,
        educations: undefined,
    },
    enrichment: {
        followers: undefined,
        experience_years: undefined,
        industry: undefined,
    },
    limit: 100,
};

const LINKEDIN_BY_COMPANY_DEFAULTS: LINKEDIN_BY_COMPANY_REQUEST = {
    discovery_filters: {
        country: '',
        city: undefined,
        company_name: undefined,
        industry: [],
        keywords: [],
        company_size: undefined,
        type: undefined,
        specialties: [],
    },
    enrichment: {
        employee_count: {},
        funding: {},
        is_recently_active: undefined,
        company_engagement_rate: {},
        is_hiring: undefined,
        recently_funded: undefined,
        follower_count: {},
        description_include: [],
        description_exclude: [],
    },
    limit: 100,
};

export const useLinkedInForm = () => {
    const { submitLeadGenScraperForm, loading } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.LINKEDIN);

    const [locationCountryCode, setLocationCountryCodeState] = useState('');
    const [locationStateIso, setLocationStateIsoState] = useState<string | undefined>(undefined);
    const [locationCity, setLocationCityState] = useState('');

    const setLocationCountryCode = useCallback((code: string) => {
        setLocationCountryCodeState(code);
        setLocationStateIsoState(undefined);
        setLocationCityState('');
    }, []);

    const setLocationStateIso = useCallback((iso: string | undefined) => {
        setLocationStateIsoState(iso);
        setLocationCityState('');
    }, []);

    const setLocationCity = useCallback((city: string) => {
        setLocationCityState(city);
    }, []);

    const peopleForm = useForm<LINKEDIN_BY_PEOPLE_REQUEST>({
        resolver: zodResolver(LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA) as Resolver<LINKEDIN_BY_PEOPLE_REQUEST>,
        defaultValues: LINKEDIN_BY_PEOPLE_DEFAULTS,
    });

    const companyForm = useForm<LINKEDIN_BY_COMPANY_REQUEST>({
        resolver: zodResolver(LINKEDIN_BY_COMPANY_REQUEST_SCHEMA) as Resolver<LINKEDIN_BY_COMPANY_REQUEST>,
        defaultValues: LINKEDIN_BY_COMPANY_DEFAULTS,
    });

    const peopleSubmitted = peopleForm.formState.isSubmitted;
    const companySubmitted = companyForm.formState.isSubmitted;

    const locationCountryOptions: OptionType[] = useMemo(
        () =>
            Country.getAllCountries().map((country) => ({
                label: country.name,
                value: country.isoCode,
            })),
        [],
    );

    const locationStateOptions: OptionType[] = useMemo(() => {
        if (!locationCountryCode) return [];
        return (
            State.getStatesOfCountry(locationCountryCode)?.map((state: IState) => ({
                label: state.name,
                value: state.isoCode,
            })) ?? []
        );
    }, [locationCountryCode]);

    const locationCityOptions: OptionType[] = useMemo(() => {
        if (!locationCountryCode || !locationStateIso) return [];
        return (
            City.getCitiesOfState(locationCountryCode, locationStateIso)?.map((city: ICity) => ({
                label: city.name,
                value: city.name,
            })) ?? []
        );
    }, [locationCountryCode, locationStateIso]);

    const isLocationStateDisabled = !locationCountryCode;
    const isLocationCityDisabled = !locationCountryCode || !locationStateIso;

    useEffect(() => {
        const cityTrim = locationCity.trim();
        const country = locationCountryCode ? Country.getCountryByCode(locationCountryCode) : undefined;
        const state =
            locationCountryCode && locationStateIso
                ? State.getStatesOfCountry(locationCountryCode)?.find((s: IState) => s.isoCode === locationStateIso)
                : undefined;

        const peopleCountry = country?.name ?? '';
        const peopleState = state?.name;
        const peopleCity = cityTrim || undefined;

        peopleForm.setValue('discovery_filters.country', peopleCountry, {
            shouldValidate: !!peopleCountry || peopleSubmitted,
        });
        peopleForm.setValue('discovery_filters.state', peopleState, {
            shouldValidate: peopleSubmitted,
        });
        peopleForm.setValue('discovery_filters.city', peopleCity, {
            shouldValidate: peopleSubmitted,
        });
        companyForm.setValue('discovery_filters.country', peopleCountry, {
            shouldValidate: !!peopleCountry || companySubmitted,
        });
        companyForm.setValue('discovery_filters.city', peopleCity, {
            shouldValidate: companySubmitted,
        });
    }, [locationCountryCode, locationStateIso, locationCity, peopleForm, companyForm, peopleSubmitted, companySubmitted]);

    const onSubmitPeople = (data: LINKEDIN_BY_PEOPLE_REQUEST) =>
        submitLeadGenScraperForm({
            body: data,
        });

    const onSubmitCompany = (data: LINKEDIN_BY_COMPANY_REQUEST) =>
        submitLeadGenScraperForm({
            body: data,
        });

    /** Clears cascaded location UI state so it does not overwrite the form after `reset()`. */
    const resetLocationPickers = useCallback(() => {
        setLocationCountryCodeState('');
        setLocationStateIsoState(undefined);
        setLocationCityState('');
    }, []);

    return {
        peopleForm,
        companyForm,
        onSubmitPeople,
        onSubmitCompany,
        resetLocationPickers,
        locationCountryCode,
        setLocationCountryCode,
        locationStateIso,
        setLocationStateIso,
        locationCity,
        setLocationCity,
        locationCountryOptions,
        locationStateOptions,
        locationCityOptions,
        isLocationStateDisabled,
        isLocationCityDisabled,
    };
};

export type UseLinkedInFormReturn = ReturnType<typeof useLinkedInForm>;
