'use client';

import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { City, Country, State } from 'country-state-city';
import { useEffect, useMemo, useState } from 'react';
import { GMAPS_REQUEST_SCHEMA as GMAPS_INTERNAL_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import type { GMAPS_INTERNAL_REQUEST } from '@aixellabs/backend/gmaps/internal/types';
import {
    GMAPS_EMPTY,
    GMAPS_PLACE_TYPE_GROUP_OPTIONS,
    getPlaceTypeGroupId,
    getPlaceTypeOptionsForGroup,
} from '@aixellabs/backend/gmaps/place-types';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { useLeadGenScraper } from '@/hooks/use-lead-gen-scraper';
import { DEFAULT_GOOGLE_MAPS_FORM_VALUES } from '../_constants';

const countries = Country.getAllCountries();
const countryOptions = countries.map((country) => ({
    label: country.name,
    value: country.isoCode,
}));

export const useGoogleMapsForm = () => {
    const { submitLeadGenScraperForm } = useLeadGenScraper(LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS);

    const form = useForm<GMAPS_INTERNAL_REQUEST>({
        resolver: zodResolver(GMAPS_INTERNAL_REQUEST_SCHEMA) as Resolver<GMAPS_INTERNAL_REQUEST>,
        defaultValues: DEFAULT_GOOGLE_MAPS_FORM_VALUES,
    });

    const selectedCountry = form.watch('country');
    const selectedState = form.watch('state');
    const selectedPlaceType = form.watch('placeType');

    const [selectedPlaceTypeGroup, setSelectedPlaceTypeGroup] = useState<string>(GMAPS_EMPTY);

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

    const placeTypeGroupOptions = GMAPS_PLACE_TYPE_GROUP_OPTIONS;

    const placeTypeOptions = useMemo(
        () => getPlaceTypeOptionsForGroup(selectedPlaceTypeGroup),
        [selectedPlaceTypeGroup],
    );

    const selectedCountryISOCode = useMemo(() => {
        if (!selectedCountry) return undefined;
        return Country.getCountryByCode(selectedCountry)?.isoCode;
    }, [selectedCountry]);

    useEffect(() => {
        if (!selectedCountryISOCode) return;
        form.setValue('countryCode', selectedCountryISOCode);
    }, [selectedCountryISOCode, form]);

    // Sync cascading group from placeType (presets / NL / restore).
    useEffect(() => {
        const groupId = getPlaceTypeGroupId(selectedPlaceType);
        if (groupId === GMAPS_EMPTY) return;
        if (groupId !== selectedPlaceTypeGroup) {
            setSelectedPlaceTypeGroup(groupId);
        }
    }, [selectedPlaceType, selectedPlaceTypeGroup]);

    const onPlaceTypeGroupChange = (groupId: string) => {
        setSelectedPlaceTypeGroup(groupId);
        form.setValue('placeType', undefined, { shouldDirty: true, shouldValidate: true });
    };

    const isStateFieldDisabled = !selectedCountry;
    const isCityFieldDisabled = !selectedCountry || !selectedState;
    const isPlaceTypeFieldDisabled = selectedPlaceTypeGroup === GMAPS_EMPTY;

    const onSubmit = (data: GMAPS_INTERNAL_REQUEST) =>
        submitLeadGenScraperForm({
            body: data,
            onSuccess: () => {
                form.reset(DEFAULT_GOOGLE_MAPS_FORM_VALUES);
                setSelectedPlaceTypeGroup(GMAPS_EMPTY);
            },
        });

    return {
        form,
        onSubmit,
        countryOptions,
        stateOptions,
        cityOptions,
        placeTypeGroupOptions,
        placeTypeOptions,
        selectedPlaceTypeGroup,
        onPlaceTypeGroupChange,
        isStateFieldDisabled,
        isCityFieldDisabled,
        isPlaceTypeFieldDisabled,
    };
};

export type UseGoogleMapsFormReturn = ReturnType<typeof useGoogleMapsForm>;
