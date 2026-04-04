'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import apiClient from '@/lib/api-client';
import { useMemo, useState } from 'react';
import type { INSTAGRAM_REQUEST, INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import { ConfirmResult } from '@/components/common/ChatInterface';
import { City, Country, ICity, IState, State } from 'country-state-city';
import { OptionType } from '@/components/ui/searchable-select';

const defaultValues: INSTAGRAM_REQUEST = {
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
    const [instagramLeads, setInstagramLeads] = useState<INSTAGRAM_RESPONSE[]>([]);
    const [selectedState, setSelectedState] = useState<string | undefined>(undefined);
    const form = useForm<INSTAGRAM_REQUEST>({
        resolver: zodResolver(INSTAGRAM_REQUEST_SCHEMA),
        defaultValues,
    });

    const onSubmit = async (data: INSTAGRAM_REQUEST): Promise<ConfirmResult> => {
        const apiResponse = await apiClient.post<INSTAGRAM_RESPONSE[], INSTAGRAM_REQUEST>(
            API_ENDPOINTS.INSTAGRAM.API.full,
            data,
        );

        if (!apiResponse.success || !apiResponse.data) {
            return {
                success: false,
                message: apiResponse.error || 'Sorry! Failed to submit form or find leads. Please try again later.',
            };
        }

        setInstagramLeads(apiResponse.data);
        return {
            success: true,
            message: 'Your Instagram search results are ready! Check the Results tab.',
        };
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
        instagramLeads,
        setInstagramLeads,
    };
};

export type UseInstagramFormReturn = ReturnType<typeof useInstagramForm>;
