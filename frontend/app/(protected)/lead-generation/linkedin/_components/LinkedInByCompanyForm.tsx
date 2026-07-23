'use client';

import {
    BooleanControlledField,
    NumberControlledField,
    SearchableGroupedMultiSelectControlledField,
    SearchableSelectControlledField,
    StringArrayControlledField,
    StringControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field';
import { LINKEDIN_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/linkedin/constants';
import { LINKEDIN_COMPANY_SIZE_OPTIONS, LINKEDIN_COMPANY_TYPE_OPTIONS } from '../_constants';
import { linkedInIndustries } from '../_static-data/linkedin-industry-options';
import { LinkedInLocationFields } from './LinkedInLocationFields';

const rangeGridClass = 'grid w-full min-w-0 grid-cols-1 gap-4 gap-y-6 sm:grid-cols-2 sm:items-start';

export const LinkedInByCompanyForm = () => {
    return (
        <FieldGroup className="flex w-full flex-col gap-10">
            <FieldSet className="min-w-0">
                <FieldLegend variant="legend">Basic filters</FieldLegend>
                <FieldDescription>
                    Discovery filters: where to search and how to match companies before enrichment.
                </FieldDescription>

                <LinkedInLocationFields mode="company" />

                <StringControlledField
                    name="discovery_filters.company_name"
                    label="Name"
                    description="Optional. Narrows discovery to companies whose name matches this text."
                    required={false}
                />

                <SearchableGroupedMultiSelectControlledField
                    name="discovery_filters.industry"
                    label="Industry"
                    description="LinkedIn industry taxonomy. Select one or more; companies matching any selected industry are included."
                    options={linkedInIndustries}
                    required={false}
                />

                <StringArrayControlledField
                    name="discovery_filters.keywords"
                    label="Keywords"
                    description="Words or phrases that should appear in the company name, tagline, or profile text."
                    required={false}
                />

                <FieldGroup className={rangeGridClass}>
                    <SearchableSelectControlledField
                        name="discovery_filters.company_size"
                        label="Size"
                        description="Employee headcount band on LinkedIn. Use this to target startups, mid-market, or enterprise."
                        options={LINKEDIN_COMPANY_SIZE_OPTIONS}
                        required={false}
                    />

                    <SearchableSelectControlledField
                        name="discovery_filters.type"
                        label="Type"
                        description="LinkedIn company type (e.g. public, nonprofit, government)."
                        options={LINKEDIN_COMPANY_TYPE_OPTIONS}
                        required={false}
                    />
                </FieldGroup>

                <StringArrayControlledField
                    label="Specialties"
                    name="discovery_filters.specialties"
                    description="Specialties or focus areas listed on the company profile."
                    required={false}
                />
            </FieldSet>

            <FieldSet className="min-w-0">
                <FieldLegend variant="legend">Enrichment</FieldLegend>
                <FieldDescription>
                    Optional thresholds and text filters applied after discovery.
                </FieldDescription>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.employee_count.min"
                        label="Employee count (min)"
                        description="Narrow to companies with at least this many employees."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.employee_count.max"
                        label="Employee count (max)"
                        description="Narrow to companies with at most this many employees."
                        required={false}
                    />
                </FieldGroup>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.funding.min"
                        label="Funding raised (min)"
                        description="Minimum total funding amount (same units as the data source)."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.funding.max"
                        label="Funding raised (max)"
                        description="Maximum total funding amount (same units as the data source)."
                        required={false}
                    />
                </FieldGroup>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.job_postings.min"
                        label="Jobs (min)"
                        description="Minimum number of live job listings."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.job_postings.max"
                        label="Jobs (max)"
                        description="Maximum number of live job listings."
                        required={false}
                    />
                </FieldGroup>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.follower_count.min"
                        label="Followers (min)"
                        description="Minimum LinkedIn followers for the company page."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.follower_count.max"
                        label="Followers (max)"
                        description="Maximum LinkedIn followers for the company page."
                        required={false}
                    />
                </FieldGroup>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.company_engagement_rate.min_likes"
                        label="Engagement — min likes"
                        description="Lower bound on likes for recent company posts, when available."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.company_engagement_rate.max_like"
                        label="Engagement — max likes"
                        description="Upper bound on likes for recent company posts."
                        required={false}
                    />
                </FieldGroup>

                <FieldGroup className={rangeGridClass}>
                    <NumberControlledField
                        name="enrichment.company_engagement_rate.min_comment"
                        label="Engagement — min comments"
                        description="Lower bound on comments for recent company posts."
                        required={false}
                    />
                    <NumberControlledField
                        name="enrichment.company_engagement_rate.max_comment"
                        label="Engagement — max comments"
                        description="Upper bound on comments for recent company posts."
                        required={false}
                    />
                </FieldGroup>

                <BooleanControlledField
                    name="enrichment.is_recently_active"
                    label="Recently active"
                    description="Only companies with recent activity on LinkedIn."
                    required={false}
                />

                <StringArrayControlledField
                    name="enrichment.description_include"
                    label="Description include(s)"
                    description="Phrases that must appear in the company’s description or “About” text."
                    required={false}
                />
                <StringArrayControlledField
                    name="enrichment.description_exclude"
                    label="Description exclude(s)"
                    description="If any of these phrases appear in the company profile, we exclude that company."
                    required={false}
                />

                <FieldGroup className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-x-8 sm:gap-y-4">
                    <BooleanControlledField
                        name="enrichment.is_hiring"
                        label="Hiring"
                        description="Only companies that are actively posting jobs on LinkedIn."
                        required={false}
                    />
                    <BooleanControlledField
                        name="enrichment.recently_funded"
                        label="Recently funded"
                        description="Only companies that have raised funding recently (per LinkedIn signals)."
                        required={false}
                    />
                </FieldGroup>
            </FieldSet>

            <FieldSet className="min-w-0">
                <FieldLegend variant="legend">Controls</FieldLegend>
                <FieldDescription>How many LinkedIn companies to return from this run.</FieldDescription>

                <NumberControlledField
                    name="limit"
                    label="Limit"
                    description={`Maximum number of LinkedIn companies to return (1–${LINKEDIN_REQUEST_RESULT_LIMIT_MAX}, integer). Defaults to 100.`}
                    required={false}
                />
            </FieldSet>
        </FieldGroup>
    );
};
