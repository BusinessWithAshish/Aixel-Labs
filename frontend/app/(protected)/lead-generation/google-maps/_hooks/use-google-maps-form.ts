'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { City, Country, State } from 'country-state-city';
import { useMemo, useState } from 'react';
import { GMAPS_REQUEST_SCHEMA as GMAPS_INTERNAL_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import type { GMAPS_INTERNAL_REQUEST, GMAPS_INTERNAL_RESPONSE} from '@aixellabs/backend/gmaps/internal/types';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import apiClient from '@/lib/api-client';
import { ConfirmResult } from '@/components/common/ChatInterface';

const DEFAULT_FORM_VALUES: GMAPS_INTERNAL_REQUEST = {
    query: '',
    country: '',
    state: '',
    cities: [],
    urls: [],
};

export const useGoogleMapsForm = () => {
    const [leads, setLeads] = useState<GMAPS_INTERNAL_RESPONSE[]>([]);

    const form = useForm<GMAPS_INTERNAL_REQUEST>({
        resolver: zodResolver(GMAPS_INTERNAL_REQUEST_SCHEMA),
        defaultValues: DEFAULT_FORM_VALUES,
    });

    const countries = Country.getAllCountries();
    const countryOptions = countries.map((country) => ({
        label: country.name,
        value: country.isoCode,
    }));

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

    const isStateFieldDisabled = !selectedCountry;
    const isCityFieldDisabled = !selectedCountry || !selectedState;

    const onSubmit = async (data: GMAPS_INTERNAL_REQUEST): Promise<ConfirmResult> => {
        const apiResponse = await apiClient.post<GMAPS_INTERNAL_RESPONSE[], GMAPS_INTERNAL_REQUEST>(API_ENDPOINTS.GMAPS.INTERNAL.full, data);
        if (!apiResponse.success || !apiResponse.data) {
            return {
                success: false,
                message: apiResponse.error || 'Sorry! Failed to submit form or find leads. Please try again later.',
            };
        }
        setLeads(apiResponse.data);
        form.reset(DEFAULT_FORM_VALUES);
        return {
            success: true,
            message: 'Leads are ready! Check the Results tab.',
        };
    };

    return {
        form,
        leads,
        setLeads,
        isSubmitting: form.formState.isSubmitting,
        onSubmit,
        countryOptions,
        stateOptions,
        cityOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    };
};

export type UseGoogleMapsFormReturn = ReturnType<typeof useGoogleMapsForm>;
