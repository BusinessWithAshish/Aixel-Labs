'use client';

import { useForm } from 'react-hook-form';
import { GMAPS_SCRAPE_REQUEST, GMAPS_SCRAPE_REQUEST_SCHEMA, GMAPS_SCRAPE_RESPONSE } from '@aixellabs/shared/common/apis';
import { zodResolver } from '@hookform/resolvers/zod';
import { City, Country, State } from 'country-state-city';
import { useMemo, useState } from 'react';
import { BACKEND_URL } from '@/config/app-config';
import { API_ENDPOINTS } from '@aixellabs/shared/common/utils';
import { toast } from 'sonner';
import sampledata from '../sample-data.json'

export const useGoogleMapsForm = () => {
    const [response, setResponse] = useState<GMAPS_SCRAPE_RESPONSE | null>(null);

    const form = useForm<GMAPS_SCRAPE_REQUEST>({
        resolver: zodResolver(GMAPS_SCRAPE_REQUEST_SCHEMA as any),
        defaultValues: {
            query: 'cafes',
            country: 'India',
            state: 'Maharashtra',
            cities: ['pimpri'],
            urls: [],
        },
    });

    const countries = Country.getAllCountries();
    const countryOptions = countries.map((country) => ({
        label: country.name,
        value: country.isoCode,
    }));

    const stateOptions = useMemo(() => {
        if (!form.watch('country')) return [];

        return State.getStatesOfCountry(form.watch('country')).map((state) => ({
            label: state.name,
            value: state.isoCode,
        }));
    }, [form.watch('country')]);

    const cityOptions = useMemo(() => {
        if (!form.watch('country') || !form.watch('state')) return [];

        return City.getCitiesOfState(form.watch('country'), form.watch('state')).map((city) => ({
            label: city.name,
            value: city.name,
        }));
    }, [form.watch('country'), form.watch('state')]);

    const isStateFieldDisabled = !form.watch('country');
    const isCityFieldDisabled = !form.watch('country') || !form.watch('state');

    const onSubmit = async (data: GMAPS_SCRAPE_REQUEST) => {
        // const response = await fetch(`${BACKEND_URL}${API_ENDPOINTS.GMAPS_SCRAPE}`, {
        //     method: 'POST',
        //     body: JSON.stringify(data),
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     credentials: 'include',
        // });
        //
        // if (!response.ok) {
        //     toast.error('Sorry! Failed to submit form or find leads. Please try again later.');
        //     return;
        // }


        // const responseData = (await response.json()) as { data: GMAPS_SCRAPE_RESPONSE };
        setResponse(sampledata.data);
    };

    return {
        form,
        response,
        onSubmit,
        countryOptions,
        stateOptions,
        cityOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    };
};

export type UseGoogleMapsFormReturn = ReturnType<typeof useGoogleMapsForm>;
