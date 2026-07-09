'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useMemo } from 'react';
import { Country } from 'country-state-city';
import {
    LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
    LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
    LINKEDIN_SEARCH_TYPE,
} from '@aixellabs/backend/linkedin/schemas';
import type { LINKEDIN_BY_COMPANY_REQUEST, LINKEDIN_BY_PEOPLE_REQUEST } from '@aixellabs/backend/linkedin/types';
import type { OptionType } from '@/components/ui/searchable-select';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';

const LINKEDIN_BY_PEOPLE_DEFAULTS: LINKEDIN_BY_PEOPLE_REQUEST = {
    searchType: LINKEDIN_SEARCH_TYPE.PEOPLE,
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
    searchType: LINKEDIN_SEARCH_TYPE.COMPANY,
    discovery_filters: {
        country: '',
        state: undefined,
        city: undefined,
        company_name: undefined,
        industry: [],
        keywords: [],
        company_size: undefined,
        type: undefined,
        specialties: [],
    },
    enrichment: {
        employee_count: undefined,
        funding: undefined,
        is_recently_active: undefined,
        company_engagement_rate: undefined,
        is_hiring: undefined,
        recently_funded: undefined,
        follower_count: undefined,
        description_include: undefined,
        description_exclude: undefined,
    },
    limit: 100,
};

export const useLinkedInForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.LINKEDIN);

    const peopleForm = useForm<LINKEDIN_BY_PEOPLE_REQUEST>({
        resolver: zodResolver(LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA) as Resolver<LINKEDIN_BY_PEOPLE_REQUEST>,
        defaultValues: LINKEDIN_BY_PEOPLE_DEFAULTS,
    });

    const companyForm = useForm<LINKEDIN_BY_COMPANY_REQUEST>({
        resolver: zodResolver(LINKEDIN_BY_COMPANY_REQUEST_SCHEMA) as Resolver<LINKEDIN_BY_COMPANY_REQUEST>,
        defaultValues: LINKEDIN_BY_COMPANY_DEFAULTS,
    });

    const locationCountryOptions: OptionType[] = useMemo(
        () =>
            Country.getAllCountries().map((country) => ({
                label: country.name,
                value: country.isoCode,
            })),
        [],
    );

    const onSubmitPeople = (data: LINKEDIN_BY_PEOPLE_REQUEST) =>
        submitLeadGenScraperForm({
            // Ensure discriminant is always present (unregistered defaultValues can be dropped).
            body: { ...data, searchType: LINKEDIN_SEARCH_TYPE.PEOPLE },
        });

    const onSubmitCompany = (data: LINKEDIN_BY_COMPANY_REQUEST) =>
        submitLeadGenScraperForm({
            body: { ...data, searchType: LINKEDIN_SEARCH_TYPE.COMPANY },
        });

    return {
        peopleForm,
        companyForm,
        onSubmitPeople,
        onSubmitCompany,
        locationCountryOptions,
    };
};

export type UseLinkedInFormReturn = ReturnType<typeof useLinkedInForm>;
