'use client';

import { LeadSource } from '@aixellabs/backend/db/types';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Field, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    ZodNumberField,
    ZodSearchableMultiSelectField,
    ZodSelectField,
    ZodStringField,
    ZodSwitchField,
} from '@/components/common/zod-form-builder/ZodFieldComponents';
import {
    INSTAGRAM_ACCOUNT_OPTIONS,
    LINKEDIN_COMPANY_SIZE_OPTIONS,
    SHOW_LINKEDIN_FILTERS_UI,
    SOURCE_FILTER_OPTIONS,
    STAR_RATING_OPTIONS,
    type FilterSource,
    type GoogleMapsFilters,
    type InstagramFilters,
    type LinkedInFilters,
} from '../../_utils/lead-filter-constants';
import Image from "next/image";

// ─── Primitive filter widgets ───────────────────────────────────────────────

function SwitchRow({
    name,
    label,
    description,
    checked,
    onCheckedChange,
}: {
    name: string;
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
}) {
    return (
        <ZodSwitchField
            name={name}
            label={label}
            description={description}
            value={checked}
            onChange={onCheckedChange}
        />
    );
}

function RangeRow({
    namePrefix,
    label,
    min,
    max,
    onMinChange,
    onMaxChange,
}: {
    namePrefix: string;
    label: string;
    min?: number;
    max?: number;
    onMinChange: (v: number | undefined) => void;
    onMaxChange: (v: number | undefined) => void;
}) {
    const toVal = (n: number) => (Number.isFinite(n) ? n : undefined);
    return (
        <FieldSet>
            <FieldLegend variant="label">
                {label}
            </FieldLegend>
            <div className="grid grid-cols-2 gap-2">
                <ZodNumberField
                    name={`${namePrefix}_min`}
                    label="Min"
                    placeholder="Min"
                    value={min}
                    onChange={(n) => onMinChange(toVal(n))}
                    className="gap-1"
                />
                <ZodNumberField
                    name={`${namePrefix}_max`}
                    label="Max"
                    placeholder="Max"
                    value={max}
                    onChange={(n) => onMaxChange(toVal(n))}
                    className="gap-1"
                />
            </div>
        </FieldSet>
    );
}

function FilterGroup({
    title,
    imageSrc,
    children,
}: {
    title: string;
    imageSrc?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                {imageSrc ? (
                    <Image src={imageSrc} alt="" className="size-4 object-contain" aria-hidden />
                ) : null}
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                    {title}
                </p>
            </div>
            {children}
        </div>
    );
}

// ─── Source multi-select ─────────────────────────────────────────────────────

function SourceMultiSelect({
    selected,
    onChange,
}: {
    selected: FilterSource[];
    onChange: (sources: FilterSource[]) => void;
}) {
    const options = SHOW_LINKEDIN_FILTERS_UI
        ? SOURCE_FILTER_OPTIONS
        : SOURCE_FILTER_OPTIONS.filter((o) => o.value !== LeadSource.LINKEDIN);

    return (
        <ZodSearchableMultiSelectField
            name="filter_sheet_sources"
            label="Source"
            options={options}
            values={selected}
            onChange={(v) => onChange(v as FilterSource[])}
            placeholder="All sources"
        />
    );
}

// ─── Star rating toggle pills ───────────────────────────────────────────────

function StarRatingPills({
    selected,
    onChange,
}: {
    selected: string[];
    onChange: (v: string[]) => void;
}) {
    const toggle = (value: string) =>
        onChange(
            selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
        );

    return (
        <Field className="gap-1.5">
            <FieldTitle>Minimum rating</FieldTitle>
            <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Minimum star rating"
            >
                {STAR_RATING_OPTIONS.map(({ value, label }) => {
                    const active = selected.includes(value);
                    return (
                        <Button
                            key={value}
                            type="button"
                            variant={active ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => toggle(value)}
                            className={cn(
                                'h-auto min-h-0 rounded-full px-3 py-1 text-sm font-normal shadow-none',
                                !active && 'border-border text-foreground hover:bg-accent',
                            )}
                        >
                            {label}
                        </Button>
                    );
                })}
            </div>
        </Field>
    );
}

// ─── Per-source filter sections ─────────────────────────────────────────────

function GoogleMapsSection({
    f,
    patch,
}: {
    f: GoogleMapsFilters;
    patch: (p: Partial<GoogleMapsFilters>) => void;
}) {
    return (
        <FilterGroup title="Google Maps" imageSrc="/google-maps.svg">
            <StarRatingPills
                selected={f.minStarRatings}
                onChange={(v) => patch({ minStarRatings: v })}
            />
            <RangeRow
                namePrefix="filter_gmaps_review_count"
                label="Review count"
                min={f.minReviews}
                max={f.maxReviews}
                onMinChange={(v) => patch({ minReviews: v })}
                onMaxChange={(v) => patch({ maxReviews: v })}
            />
            <ZodStringField
                name="filter_gmaps_category_contains"
                label="Category"
                placeholder="e.g. restaurant, gym…"
                value={f.categoryContains}
                onChange={(v) => patch({ categoryContains: v })}
            />
            <SwitchRow
                name="filter_gmaps_require_phone"
                label="Has phone number"
                checked={f.requirePhone}
                onCheckedChange={(v) => patch({ requirePhone: v })}
            />
            <SwitchRow
                name="filter_gmaps_require_website"
                label="Has website"
                checked={f.requireWebsite}
                onCheckedChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

function InstagramSection({
    f,
    patch,
}: {
    f: InstagramFilters;
    patch: (p: Partial<InstagramFilters>) => void;
}) {
    return (
        <FilterGroup title="Instagram" imageSrc="/instagram-logo.svg">
            <ZodSelectField
                name="filter_ig_account_type"
                label="Account type"
                options={INSTAGRAM_ACCOUNT_OPTIONS}
                value={f.accountFilter}
                onChange={(v) => patch({ accountFilter: v as InstagramFilters['accountFilter'] })}
            />
            <RangeRow
                namePrefix="filter_ig_followers"
                label="Followers"
                min={f.minFollowers}
                max={f.maxFollowers}
                onMinChange={(v) => patch({ minFollowers: v })}
                onMaxChange={(v) => patch({ maxFollowers: v })}
            />
            <RangeRow
                namePrefix="filter_ig_following"
                label="Following"
                min={f.minFollowing}
                max={f.maxFollowing}
                onMinChange={(v) => patch({ minFollowing: v })}
                onMaxChange={(v) => patch({ maxFollowing: v })}
            />
            <RangeRow
                namePrefix="filter_ig_posts"
                label="Posts"
                min={f.minPosts}
                max={f.maxPosts}
                onMinChange={(v) => patch({ minPosts: v })}
                onMaxChange={(v) => patch({ maxPosts: v })}
            />
            <SwitchRow
                name="filter_ig_require_email"
                label="Has business email"
                checked={f.requireEmail}
                onCheckedChange={(v) => patch({ requireEmail: v })}
            />
            <SwitchRow
                name="filter_ig_require_phone"
                label="Has business phone"
                checked={f.requirePhone}
                onCheckedChange={(v) => patch({ requirePhone: v })}
            />
            <SwitchRow
                name="filter_ig_require_website"
                label="Has website"
                checked={f.requireWebsite}
                onCheckedChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

function LinkedInSection({
    f,
    patch,
}: {
    f: LinkedInFilters;
    patch: (p: Partial<LinkedInFilters>) => void;
}) {
    return (
        <FilterGroup title="LinkedIn" imageSrc="/linkedin-logo-svg.png">
            <ZodStringField
                name="filter_li_industry_contains"
                label="Industry"
                placeholder="e.g. software, finance…"
                value={f.industryContains}
                onChange={(v) => patch({ industryContains: v })}
            />
            <ZodStringField
                name="filter_li_country_contains"
                label="Country"
                placeholder="e.g. United States…"
                value={f.countryContains}
                onChange={(v) => patch({ countryContains: v })}
            />
            <ZodSearchableMultiSelectField
                name="filter_li_company_sizes"
                label="Company size"
                options={LINKEDIN_COMPANY_SIZE_OPTIONS}
                values={f.companySizes}
                onChange={(v) => patch({ companySizes: v })}
                placeholder="Any size"
            />
            <RangeRow
                namePrefix="filter_li_employees"
                label="Employees"
                min={f.minEmployees}
                max={f.maxEmployees}
                onMinChange={(v) => patch({ minEmployees: v })}
                onMaxChange={(v) => patch({ maxEmployees: v })}
            />
            <RangeRow
                namePrefix="filter_li_followers"
                label="Followers"
                min={f.minFollowers}
                max={f.maxFollowers}
                onMinChange={(v) => patch({ minFollowers: v })}
                onMaxChange={(v) => patch({ maxFollowers: v })}
            />
            <ZodNumberField
                name="filter_li_min_funding_rounds"
                label="Min funding rounds"
                placeholder="Any"
                value={f.minFundingRounds}
                onChange={(n) =>
                    patch({ minFundingRounds: Number.isFinite(n) ? n : undefined })
                }
            />
            <SwitchRow
                name="filter_li_require_hiring"
                label="Actively hiring"
                checked={f.requireHiring}
                onCheckedChange={(v) => patch({ requireHiring: v })}
            />
            <SwitchRow
                name="filter_li_require_website"
                label="Has website"
                checked={f.requireWebsite}
                onCheckedChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

// ─── Sheet ──────────────────────────────────────────────────────────────────

type FilterPanelShape = {
    filters: {
        sources: FilterSource[];
        googleMaps: GoogleMapsFilters;
        instagram: InstagramFilters;
        linkedin: LinkedInFilters;
    };
    setSources: (sources: FilterSource[]) => void;
    patchGoogleMaps: (patch: Partial<GoogleMapsFilters>) => void;
    patchInstagram: (patch: Partial<InstagramFilters>) => void;
    patchLinkedIn: (patch: Partial<LinkedInFilters>) => void;
    resetFilters: () => void;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filterPanel: FilterPanelShape;
};

export const LeadsFilterSheet = ({ open, onOpenChange, filterPanel }: Props) => {
    const { filters, setSources, patchGoogleMaps, patchInstagram, patchLinkedIn, resetFilters } =
        filterPanel;
    const { sources, googleMaps, instagram, linkedin } = filters;

    const displayedSources = SHOW_LINKEDIN_FILTERS_UI
        ? sources
        : sources.filter((s) => s !== LeadSource.LINKEDIN);

    const showGoogleMaps = sources.length === 0 || sources.includes(LeadSource.GOOGLE_MAPS);
    const showInstagram = sources.length === 0 || sources.includes(LeadSource.INSTAGRAM);
    const showLinkedIn =
        SHOW_LINKEDIN_FILTERS_UI &&
        (sources.length === 0 || sources.includes(LeadSource.LINKEDIN));

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-sm">
                <SheetHeader className="border-b p-4">
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>
                        Filters are saved in this browser automatically.
                    </SheetDescription>
                </SheetHeader>

                <div className="shrink-0 border-b bg-background px-4 py-3">
                    <SourceMultiSelect selected={displayedSources} onChange={setSources} />
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5">
                    <div className="flex flex-col gap-6">
                        {showGoogleMaps ? (
                            <GoogleMapsSection f={googleMaps} patch={patchGoogleMaps} />
                        ) : null}

                        {showGoogleMaps && showInstagram ? <Separator /> : null}

                        {showInstagram ? (
                            <InstagramSection f={instagram} patch={patchInstagram} />
                        ) : null}

                        {(showGoogleMaps || showInstagram) && showLinkedIn ? <Separator /> : null}

                        {showLinkedIn ? (
                            <LinkedInSection f={linkedin} patch={patchLinkedIn} />
                        ) : null}
                    </div>
                </div>

                <SheetFooter className="border-t p-4">
                    <Button variant="outline" className="flex-1" onClick={resetFilters}>
                        Reset filters
                    </Button>
                    <Button className="flex-1" onClick={() => onOpenChange(false)}>
                        Done
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
};
