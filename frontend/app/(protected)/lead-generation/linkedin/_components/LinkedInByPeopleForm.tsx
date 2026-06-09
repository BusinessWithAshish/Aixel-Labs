'use client';

import {
    BooleanControlledField,
    NumberControlledField,
    SearchableGroupedMultiSelectControlledField,
    SearchableSelectControlledField,
    StringArrayControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { LINKEDIN_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/linkedin/constants';
import { LINKEDIN_COMPANY_SIZE_OPTIONS, LINKEDIN_SENIORITY_OPTIONS } from '../_constants';
import { linkedInIndustries } from '../_static-data/linkedin-industry-options';
import { LinkedInLocationFields } from './LinkedInLocationFields';

export const LinkedInByPeopleForm = () => {
    return (
        <div className="space-y-3">
            <LinkedInLocationFields mode="people" />

            <StringArrayControlledField
                name="job_titles"
                description="Current or recent job titles to match (for example “Software Engineer”, “Head of Marketing”). We look for people whose roles align with these titles."
                required={false}
            />
            <StringArrayControlledField
                name="keywords"
                description="Words or phrases that should show up on the person’s profile—headline, about, skills, or experience descriptions."
                required={false}
            />

            <SearchableSelectControlledField
                name="seniority"
                description="Career level on LinkedIn (from entry-level through leadership). Leave empty to include all levels."
                options={LINKEDIN_SENIORITY_OPTIONS}
                required={false}
            />
            <SearchableSelectControlledField
                name="company_size"
                description="Only include people whose employer falls in this headcount band (LinkedIn company size)."
                options={LINKEDIN_COMPANY_SIZE_OPTIONS}
                required={false}
            />
            <SearchableGroupedMultiSelectControlledField
                name="industry"
                description="LinkedIn industry taxonomy for the person’s current company. Pick one or more; we match if the company is in any selected industry."
                options={linkedInIndustries}
                required={false}
            />

            <StringArrayControlledField
                name="company_keywords"
                description="Terms that should appear in the employer’s name or company page—useful when the brand name differs from the legal entity."
                required={false}
            />
            <StringArrayControlledField
                name="company_location"
                description="Extra free-text places for where the company is based (cities, regions, or countries), in addition to the structured location above."
                required={false}
            />

            <div className="grid items-baseline gap-3 sm:grid-cols-2">
                <NumberControlledField
                    name="experience_years.min"
                    label="Total experience (min years)"
                    description="Minimum years of professional experience across roles."
                    required={false}
                />
                <NumberControlledField
                    name="experience_years.max"
                    label="Total experience (max years)"
                    description="Maximum years of professional experience across roles."
                    required={false}
                />
            </div>
            <div className="grid items-baseline gap-3 sm:grid-cols-2">
                <NumberControlledField
                    name="years_at_company.min"
                    label="Years at current company (min)"
                    description="Lower bound on how long they have been at their present employer."
                    required={false}
                />
                <NumberControlledField
                    name="years_at_company.max"
                    label="Years at current company (max)"
                    description="Upper bound on tenure at their present employer."
                    required={false}
                />
            </div>

            <StringArrayControlledField
                name="schools"
                description="Schools or universities listed on the profile. Matches any of the names you add."
                required={false}
            />

            <BooleanControlledField
                name="has_email"
                description="Only return profiles where a work or contact email is available."
                required={false}
            />
            <BooleanControlledField
                name="has_phone"
                description="Only return profiles where a phone number is available."
                required={false}
            />

            <NumberControlledField
                name="limit"
                description={`Maximum number of people to return (1–${LINKEDIN_REQUEST_RESULT_LIMIT_MAX}, integer). The form defaults to 100.`}
                required={false}
            />
        </div>
    );
};
