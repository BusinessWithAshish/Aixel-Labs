'use client';

import {
    NumberControlledField,
    SearchableSelectControlledField,
    SelectControlledField,
    StringControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { enumToOptions } from '@/components/common/zod-form-builder/schema-utils';
import { GSEARCH_MAX_PAGES, GSEARCH_SAFE } from '@aixellabs/backend/gsearch/constants';
import type { UseGoogleAdvancedSearchFormReturn } from '../_hooks/use-google-advanced-search-form';
import { GSEARCH_TIME_FILTER_OPTIONS } from '../_constants';

const SAFE_OPTIONS = enumToOptions(Object.values(GSEARCH_SAFE));

export const GoogleAdvancedSearchQueryForm = () => {
    const {
        countryOptions,
        stateOptions,
        cityOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    } = usePage<UseGoogleAdvancedSearchFormReturn>();

    return (
        <>
            <StringControlledField
                name="searchQuery"
                label="Search query"
                description="Enter the web search query to find leads on Google"
                required={true}
            />

            <SearchableSelectControlledField
                name="country"
                label="Country"
                description="Select the country to target search results"
                options={countryOptions}
                required={true}
            />

            <SearchableSelectControlledField
                name="state"
                label="State"
                description="Optional state or province to refine location targeting"
                options={stateOptions}
                disabled={isStateFieldDisabled}
                required={false}
            />

            <SearchableSelectControlledField
                name="region"
                label="City"
                description="Optional city or locality to refine location targeting"
                options={cityOptions}
                disabled={isCityFieldDisabled}
                required={false}
            />

            <NumberControlledField
                name="pages"
                label="Pages"
                description={`Number of result pages to fetch (1–${GSEARCH_MAX_PAGES}, ~20 results each)`}
                required={false}
                min={1}
                max={GSEARCH_MAX_PAGES}
            />

            <SelectControlledField
                name="safe"
                label="Safe search"
                description="Filter adult content from results"
                options={SAFE_OPTIONS}
                required={false}
                isClearable
            />

            <SelectControlledField
                name="timeFilter"
                label="Time filter"
                description="Restrict results to a recent time window (defaults to last 24 hours for fresher leads)"
                options={GSEARCH_TIME_FILTER_OPTIONS}
                required={false}
            />

            <StringControlledField
                name="language"
                label="Language"
                description="Results language code (e.g. en, es, hi)"
                required={false}
            />
        </>
    );
};
