'use client';

import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { City, ICity, IState, State } from 'country-state-city';
import { SearchableSelectControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import type { OptionType } from '@/components/ui/searchable-select';
import type { UseLinkedInFormReturn } from '../_hooks/use-linkedin-form';

type LinkedInLocationFieldsProps = {
    /** Used only for copy differences between people vs company. */
    mode: 'people' | 'company';
};

const LOCATION_COPY: Record<LinkedInLocationFieldsProps['mode'], { country: string; state: string; city: string }> = {
    people: {
        country:
            'Where this person is based. Country is required (ISO code). Add state and/or city to narrow results — both are sent to search as "in City, State".',
        state: 'Optional. State or province name for the selected country.',
        city: 'Optional. City name. Combined with state when both are set.',
    },
    company: {
        country:
            'Where the company is headquartered. Country is required (ISO code). Add state and/or city to narrow — both are sent as "in City, State".',
        state: 'Optional. State or province name for the selected country.',
        city: 'Optional. City name. Combined with state when both are set.',
    },
};

export function LinkedInLocationFields({ mode }: LinkedInLocationFieldsProps) {
    const { locationCountryOptions } = usePage<UseLinkedInFormReturn>();
    const { watch } = useFormContext();
    const copy = LOCATION_COPY[mode];

    const selectedCountry = (watch('discovery_filters.country') as string) || '';
    const selectedState = (watch('discovery_filters.state') as string | undefined) || '';

    const stateOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry) return [];
        return (
            State.getStatesOfCountry(selectedCountry)?.map((state: IState) => ({
                label: state.name,
                value: state.name,
            })) ?? []
        );
    }, [selectedCountry]);

    const cityOptions: OptionType[] = useMemo(() => {
        if (!selectedCountry || !selectedState) return [];
        const stateIso = State.getStatesOfCountry(selectedCountry)?.find(
            (s: IState) => s.name === selectedState,
        )?.isoCode;
        if (!stateIso) return [];
        return (
            City.getCitiesOfState(selectedCountry, stateIso)?.map((city: ICity) => ({
                label: city.name,
                value: city.name,
            })) ?? []
        );
    }, [selectedCountry, selectedState]);

    return (
        <div className="space-y-3">
            <SearchableSelectControlledField
                name="discovery_filters.country"
                label="Country"
                description={copy.country}
                options={locationCountryOptions}
                required
            />
            <SearchableSelectControlledField
                name="discovery_filters.state"
                label="State / province"
                description={copy.state}
                options={stateOptions}
                disabled={!selectedCountry}
                required={false}
            />
            <SearchableSelectControlledField
                name="discovery_filters.city"
                label="City / region"
                description={copy.city}
                options={cityOptions}
                disabled={!selectedCountry || !selectedState}
                required={false}
            />
        </div>
    );
}
