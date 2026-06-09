'use client';

import { ZodSearchableSelectField } from '@/components/common/zod-form-builder';
import { usePage } from '@/contexts/PageStore';
import type { UseLinkedInFormReturn } from '../_hooks/use-linkedin-form';

type LinkedInLocationFieldsProps = {
    /** Used only for unique field names when both tab forms are mounted. */
    mode: 'people' | 'company';
};

const LOCATION_COPY: Record<LinkedInLocationFieldsProps['mode'], { country: string; state: string; city: string }> = {
    people: {
        country:
            'Where this person is based on their profile. Country is required. Add state or city to narrow results; the most specific place you pick is what we search for.',
        state: 'Optional. Regions or provinces for the selected country (standard ISO list).',
        city: 'Optional. When set, we use this city (or metro) as the location instead of only country or state.',
    },
    company: {
        country:
            'Where the company is headquartered or primarily operates. Country is required. Add state or city to narrow; the most specific selection is used.',
        state: 'Optional. Regions or provinces for the selected country (standard ISO list).',
        city: 'Optional. When set, we use this city or region as the company location.',
    },
};

export function LinkedInLocationFields({ mode }: LinkedInLocationFieldsProps) {
    const page = usePage<UseLinkedInFormReturn>();
    const copy = LOCATION_COPY[mode];
    const suffix = mode === 'people' ? 'people' : 'company';

    return (
        <div className="space-y-3">
            <ZodSearchableSelectField
                name={`linkedin-location-country-${suffix}`}
                label="Country"
                description={copy.country}
                value={page.locationCountryCode}
                onChange={page.setLocationCountryCode}
                options={page.locationCountryOptions}
                required
            />
            <ZodSearchableSelectField
                name={`linkedin-location-state-${suffix}`}
                label="State / province"
                description={copy.state}
                value={page.locationStateIso ?? ''}
                onChange={(v) => page.setLocationStateIso(v || undefined)}
                options={page.locationStateOptions}
                disabled={page.isLocationStateDisabled}
                required={false}
            />
            <ZodSearchableSelectField
                name={`linkedin-location-city-${suffix}`}
                label="City / region"
                description={copy.city}
                value={page.locationCity}
                onChange={page.setLocationCity}
                options={page.locationCityOptions}
                disabled={page.isLocationCityDisabled}
                required={false}
            />
        </div>
    );
}
