'use client';

import { useForm } from 'react-hook-form';
import { GMAPS_SCRAPE_REQUEST, GMAPS_SCRAPE_REQUEST_SCHEMA, GMAPS_SCRAPE_RESPONSE } from '@aixellabs/shared/common/apis';
import { zodResolver } from '@hookform/resolvers/zod';
import { City, Country, State } from 'country-state-city';
import { useMemo, useState } from 'react';
import { BACKEND_URL } from '@/config/app-config';
import { API_ENDPOINTS } from '@aixellabs/shared/common/utils';
import { toast } from 'sonner';

const DEFAULT_FORM_VALUES: GMAPS_SCRAPE_REQUEST = {
    query: '',
    country: '',
    state: '',
    cities: [],
    urls: [],
};

export const useGoogleMapsForm = () => {
    const [response, setResponse] = useState<GMAPS_SCRAPE_RESPONSE | null>(null);

    const form = useForm<GMAPS_SCRAPE_REQUEST>({
        resolver: zodResolver(GMAPS_SCRAPE_REQUEST_SCHEMA as any),
        defaultValues: DEFAULT_FORM_VALUES,
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
    }, [form]);

    const cityOptions = useMemo(() => {
        if (!form.watch('country') || !form.watch('state')) return [];

        return City.getCitiesOfState(form.watch('country'), form.watch('state')).map((city) => ({
            label: city.name,
            value: city.name,
        }));
    }, [form]);

    const isStateFieldDisabled = !form.watch('country');
    const isCityFieldDisabled = !form.watch('country') || !form.watch('state');

    const onSubmit = async (data: GMAPS_SCRAPE_REQUEST) => {
        try {
            const res = await fetch(`${BACKEND_URL}${API_ENDPOINTS.GMAPS_SCRAPE}`, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            if (!res.ok) {
                toast.error('Sorry! Failed to submit form or find leads. Please try again later.');
                return;
            }
            const responseData = (await res.json()) as { data: GMAPS_SCRAPE_RESPONSE };
            setResponse(responseData.data);
            toast.success('Leads are ready! Check the Results tab.');
        } catch (error) {
            console.error('Error while submitting form:', error);
            toast.error('Sorry! Failed to submit form or find leads. Please try again later.');
        } finally {
            form.reset(DEFAULT_FORM_VALUES);
        }
    };

    return {
        form,
        response,
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
