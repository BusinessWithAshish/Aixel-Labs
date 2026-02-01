'use client';

import { usePage } from "@/contexts/PageStore";
import { UseGoogleMapsFormReturn } from "../_hooks/use-google-maps-form";
import { SearchableMultiSelectControlledField, SearchableSelectControlledField, StringControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";

export const GoogleMapsQueryForm = () => {

    const { countryOptions, stateOptions, cityOptions, isStateFieldDisabled, isCityFieldDisabled } = usePage<UseGoogleMapsFormReturn>();

    return (
        <>
            <StringControlledField
                name="query"
                label="Query"
                description="Enter the query to search for leads on Google Maps"
                required={true}
            />

            <SearchableSelectControlledField
                name="country"
                label="Country"
                required={true}
                description="Select the country to search for leads on Google Maps"
                options={countryOptions}
            />

            <SearchableSelectControlledField
                name="state"
                label="State"
                disabled={isStateFieldDisabled}
                description="Select the state to search for leads on Google Maps"
                options={stateOptions}
            />

            <SearchableMultiSelectControlledField
                name="cities"
                label="Cities"
                disabled={isCityFieldDisabled}
                description="Select the cities to search for leads on Google Maps"
                options={cityOptions}
            />
        </>
    );
};