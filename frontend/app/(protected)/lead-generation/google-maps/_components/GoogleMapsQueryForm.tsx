'use client';

import { usePage } from '@/contexts/PageStore';
import { UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';
import {
    BooleanControlledField,
    NumberControlledField,
    SearchableMultiSelectControlledField,
    SearchableSelectControlledField,
    StringControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { ZodSearchableSelectField } from '@/components/common/zod-form-builder/ZodFieldComponents';
import { GMAPS_EMPTY, GMAPS_REQUEST_LIMIT_MAX } from '../_constants';

export const GoogleMapsQueryForm = () => {
    const {
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
    } = usePage<UseGoogleMapsFormReturn>();

    return (
        <>
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

            <ZodSearchableSelectField
                name="placeTypeGroup"
                label="Category"
                description="Business category group (Places Table A). Choose a group, then a place type."
                options={placeTypeGroupOptions}
                value={selectedPlaceTypeGroup === GMAPS_EMPTY ? undefined : selectedPlaceTypeGroup}
                onChange={onPlaceTypeGroupChange}
                required={false}
            />

            <SearchableSelectControlledField
                name="placeType"
                label="Place type"
                description="Specific business type to search for. Required unless you use custom keywords below."
                options={placeTypeOptions}
                disabled={isPlaceTypeFieldDisabled}
                required={false}
            />

            <StringControlledField
                name="query"
                label="Keywords"
                description="Optional modifiers (e.g. emergency, 24 hour) or a custom search when no place type fits. Do not include city names."
                required={false}
            />

            <NumberControlledField
                name="enrichment.minRating"
                label="Minimum rating"
                description="Only keep places at or above this star rating (0 = any). Use steps of 0.5 (e.g. 4 or 4.5)."
                required={false}
                min={0}
                max={5}
                step={0.5}
            />

            <div className="grid items-baseline gap-3 sm:grid-cols-2">
                <NumberControlledField
                    name="enrichment.minReviews"
                    label="Min reviews"
                    description="Minimum review count. 0 means no minimum."
                    required={false}
                    min={0}
                />
                <NumberControlledField
                    name="enrichment.maxReviews"
                    label="Max reviews"
                    description="Maximum review count. Leave empty for no upper bound."
                    required={false}
                    min={0}
                />
            </div>

            <StringControlledField
                name="enrichment.categoryContains"
                label="Category contains"
                description="Keep places whose category labels include this text (e.g. restaurant, gym)."
                required={false}
            />

            <BooleanControlledField
                name="enrichment.requirePhone"
                label="Require phone"
                description="Only return places that have a phone number."
                required={false}
            />
            <BooleanControlledField
                name="enrichment.requireWebsite"
                label="Require website"
                description="Only return places that have a website."
                required={false}
            />

            <NumberControlledField
                name="limit"
                label="Max results"
                description={`Maximum Google Maps places to return after filters (1–${GMAPS_REQUEST_LIMIT_MAX}).`}
                required={false}
                min={1}
                max={GMAPS_REQUEST_LIMIT_MAX}
            />
        </>
    );
};