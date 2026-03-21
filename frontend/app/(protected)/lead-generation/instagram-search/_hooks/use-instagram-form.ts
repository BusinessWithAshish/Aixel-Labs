'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import apiClient from '@/lib/api-client';
import { useMemo, useState } from 'react';
import type { INSTAGRAM_REQUEST, INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import { ConfirmResult } from '@/components/common/ChatInterface';
import countries from '../_static-data/countries.json';
import cities from '../_static-data/cities.json';

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
    const form = useForm<INSTAGRAM_REQUEST>({
        resolver: zodResolver(INSTAGRAM_REQUEST_SCHEMA),
        defaultValues,
    });

    const onSubmit = async (data: INSTAGRAM_REQUEST): Promise<ConfirmResult> => {
        const apiResponse = await apiClient.post<INSTAGRAM_RESPONSE[], INSTAGRAM_REQUEST>(API_ENDPOINTS.INSTAGRAM.API.full, data);

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

    const countryOptions = Object.entries(countries).map(([key, value]) => ({
        label: value,
        value: key,
    }));

    const selectedCountry = form.watch('country');

    const cityOptions = useMemo(() => {
        return cities
            .filter((city) => city.country_code !== 'NA' && city.country_code === selectedCountry)
            .map((city) => ({
                label: city.name,
                value: city.id,
            }));
    }, [selectedCountry]);

    const isCityFieldDisabled = !selectedCountry;

    return {
        form,
        countryOptions,
        isCityFieldDisabled,
        cityOptions,
        onSubmit,
        instagramLeads,
        setInstagramLeads,
    };
};

export type UseInstagramFormReturn = ReturnType<typeof useInstagramForm>;
