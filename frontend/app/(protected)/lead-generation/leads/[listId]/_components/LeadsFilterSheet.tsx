'use client';

import { LeadSource } from '@aixellabs/backend/db/types';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FieldLegend, FieldSet } from '@/components/ui/field';
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
} from '@/components/common/zod-form-builder/ZodFieldComponents';
import {
    GMAPS_MIN_RATING_SELECT_OPTIONS,
    INSTAGRAM_ACCOUNT_OPTIONS,
    LINKEDIN_COMPANY_SIZE_OPTIONS,
    SHOW_LINKEDIN_FILTERS_UI,
    SOURCE_FILTER_OPTIONS,
    TRI_STATE_FILTER_OPTIONS,
    type FacebookFilters,
    type FilterSource,
    type GoogleMapsFilters,
    type InstagramFilters,
    type LinkedInFilters,
    type TriStateFilter,
} from '../../_utils/lead-filter-constants';
import {
    FACEBOOK_SORT_OPTIONS,
    GMAPS_SORT_OPTIONS,
    INSTAGRAM_SORT_OPTIONS,
    LINKEDIN_SORT_OPTIONS,
    SORT_BY_NONE,
    defaultDirectionForSortBy,
    sortDirectionOptions,
    type FacebookSortBy,
    type GmapsSortBy,
    type InstagramSortBy,
    type LeadSortState,
    type LinkedInSortBy,
    type SortDirection,
    type SourceSortConfig,
} from '../../_utils/lead-sort-constants';
import Image from 'next/image';

// ─── Primitive filter widgets ───────────────────────────────────────────────

function TriStateSelectRow({
    name,
    label,
    value,
    onValueChange,
}: {
    name: string;
    label: string;
    value: TriStateFilter;
    onValueChange: (v: TriStateFilter) => void;
}) {
    return (
        <ZodSelectField
            name={name}
            label={label}
            options={TRI_STATE_FILTER_OPTIONS}
            value={value}
            onChange={(v) => onValueChange(v as TriStateFilter)}
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

function SortRow<T extends string>({
    namePrefix,
    options,
    value,
    onChange,
}: {
    namePrefix: string;
    options: { value: T | typeof SORT_BY_NONE; label: string }[];
    value: SourceSortConfig<T>;
    onChange: (next: SourceSortConfig<T>) => void;
}) {
    const active = value.by !== SORT_BY_NONE;

    return (
        <div className="flex flex-col gap-3">
            <ZodSelectField
                name={`${namePrefix}_sort_by`}
                label="Sort by"
                options={options}
                value={value.by}
                onChange={(v) => {
                    const by = (v || SORT_BY_NONE) as T | typeof SORT_BY_NONE;
                    onChange({
                        by,
                        direction:
                            by === SORT_BY_NONE ? value.direction : defaultDirectionForSortBy(by),
                    });
                }}
            />
            {active ? (
                <ZodSelectField
                    name={`${namePrefix}_sort_dir`}
                    label="Order"
                    options={sortDirectionOptions(value.by)}
                    value={value.direction}
                    onChange={(v) => onChange({ ...value, direction: v as SortDirection })}
                />
            ) : null}
        </div>
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
                    <Image src={imageSrc} alt="" width={16} height={16} className="size-4 object-contain" aria-hidden />
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

// ─── Per-source filter sections ─────────────────────────────────────────────

function GoogleMapsSection({
    f,
    sort,
    patch,
    patchSort,
}: {
    f: GoogleMapsFilters;
    sort: SourceSortConfig<GmapsSortBy>;
    patch: (p: Partial<GoogleMapsFilters>) => void;
    patchSort: (p: Partial<SourceSortConfig<GmapsSortBy>>) => void;
}) {
    return (
        <FilterGroup title="Google Maps" imageSrc="/google-maps.svg">
            <SortRow
                namePrefix="filter_gmaps"
                options={GMAPS_SORT_OPTIONS}
                value={sort}
                onChange={(next) => patchSort(next)}
            />
            <ZodSelectField
                name="filter_gmaps_min_rating"
                label="Minimum rating"
                options={GMAPS_MIN_RATING_SELECT_OPTIONS}
                value={String(f.minRating)}
                onChange={(v) => patch({ minRating: Number(v) })}
            />
            <RangeRow
                namePrefix="filter_gmaps_review_count"
                label="Review count"
                min={f.minReviews > 0 ? f.minReviews : undefined}
                max={f.maxReviews ?? undefined}
                onMinChange={(v) => patch({ minReviews: v ?? 0 })}
                onMaxChange={(v) => patch({ maxReviews: v ?? null })}
            />
            <ZodStringField
                name="filter_gmaps_category_contains"
                label="Category"
                placeholder="e.g. restaurant, gym…"
                value={f.categoryContains}
                onChange={(v) => patch({ categoryContains: v })}
            />
            <TriStateSelectRow
                name="filter_gmaps_require_phone"
                label="Has phone number"
                value={f.requirePhone}
                onValueChange={(v) => patch({ requirePhone: v })}
            />
            <TriStateSelectRow
                name="filter_gmaps_require_website"
                label="Has website"
                value={f.requireWebsite}
                onValueChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

function InstagramSection({
    f,
    sort,
    patch,
    patchSort,
}: {
    f: InstagramFilters;
    sort: SourceSortConfig<InstagramSortBy>;
    patch: (p: Partial<InstagramFilters>) => void;
    patchSort: (p: Partial<SourceSortConfig<InstagramSortBy>>) => void;
}) {
    return (
        <FilterGroup title="Instagram" imageSrc="/instagram-logo.svg">
            <SortRow
                namePrefix="filter_ig"
                options={INSTAGRAM_SORT_OPTIONS}
                value={sort}
                onChange={(next) => patchSort(next)}
            />
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
            <TriStateSelectRow
                name="filter_ig_require_email"
                label="Has business email"
                value={f.requireEmail}
                onValueChange={(v) => patch({ requireEmail: v })}
            />
            <TriStateSelectRow
                name="filter_ig_require_phone"
                label="Has business phone"
                value={f.requirePhone}
                onValueChange={(v) => patch({ requirePhone: v })}
            />
            <TriStateSelectRow
                name="filter_ig_require_website"
                label="Has website"
                value={f.requireWebsite}
                onValueChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

function FacebookSection({
    f,
    sort,
    patch,
    patchSort,
}: {
    f: FacebookFilters;
    sort: SourceSortConfig<FacebookSortBy>;
    patch: (p: Partial<FacebookFilters>) => void;
    patchSort: (p: Partial<SourceSortConfig<FacebookSortBy>>) => void;
}) {
    return (
        <FilterGroup title="Facebook" imageSrc="/facebook-logo.svg">
            <SortRow
                namePrefix="filter_fb"
                options={FACEBOOK_SORT_OPTIONS}
                value={sort}
                onChange={(next) => patchSort(next)}
            />
            <RangeRow
                namePrefix="filter_fb_followers"
                label="Followers"
                min={f.minFollowers}
                max={f.maxFollowers}
                onMinChange={(v) => patch({ minFollowers: v })}
                onMaxChange={(v) => patch({ maxFollowers: v })}
            />
            <RangeRow
                namePrefix="filter_fb_likes"
                label="Likes"
                min={f.minLikes}
                max={f.maxLikes}
                onMinChange={(v) => patch({ minLikes: v })}
                onMaxChange={(v) => patch({ maxLikes: v })}
            />
            <TriStateSelectRow
                name="filter_fb_require_verified"
                label="Verified Page"
                value={f.requireVerified}
                onValueChange={(v) => patch({ requireVerified: v })}
            />
            <TriStateSelectRow
                name="filter_fb_require_email"
                label="Has email"
                value={f.requireEmail}
                onValueChange={(v) => patch({ requireEmail: v })}
            />
            <TriStateSelectRow
                name="filter_fb_require_phone"
                label="Has phone"
                value={f.requirePhone}
                onValueChange={(v) => patch({ requirePhone: v })}
            />
            <TriStateSelectRow
                name="filter_fb_require_website"
                label="Has website"
                value={f.requireWebsite}
                onValueChange={(v) => patch({ requireWebsite: v })}
            />
        </FilterGroup>
    );
}

function LinkedInSection({
    f,
    sort,
    patch,
    patchSort,
}: {
    f: LinkedInFilters;
    sort: SourceSortConfig<LinkedInSortBy>;
    patch: (p: Partial<LinkedInFilters>) => void;
    patchSort: (p: Partial<SourceSortConfig<LinkedInSortBy>>) => void;
}) {
    return (
        <FilterGroup title="LinkedIn" imageSrc="/linkedin-logo-svg.png">
            <SortRow
                namePrefix="filter_li"
                options={LINKEDIN_SORT_OPTIONS}
                value={sort}
                onChange={(next) => patchSort(next)}
            />
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
            <TriStateSelectRow
                name="filter_li_require_hiring"
                label="Actively hiring"
                value={f.requireHiring}
                onValueChange={(v) => patch({ requireHiring: v })}
            />
            <TriStateSelectRow
                name="filter_li_require_website"
                label="Has website"
                value={f.requireWebsite}
                onValueChange={(v) => patch({ requireWebsite: v })}
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
        facebook: FacebookFilters;
        linkedin: LinkedInFilters;
        sort: LeadSortState;
    };
    setSources: (sources: FilterSource[]) => void;
    patchGoogleMaps: (patch: Partial<GoogleMapsFilters>) => void;
    patchInstagram: (patch: Partial<InstagramFilters>) => void;
    patchFacebook: (patch: Partial<FacebookFilters>) => void;
    patchLinkedIn: (patch: Partial<LinkedInFilters>) => void;
    patchSort: (patch: {
        googleMaps?: Partial<SourceSortConfig<GmapsSortBy>>;
        instagram?: Partial<SourceSortConfig<InstagramSortBy>>;
        facebook?: Partial<SourceSortConfig<FacebookSortBy>>;
        linkedin?: Partial<SourceSortConfig<LinkedInSortBy>>;
    }) => void;
    resetFilters: () => void;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filterPanel: FilterPanelShape;
};

export const LeadsFilterSheet = ({ open, onOpenChange, filterPanel }: Props) => {
    const {
        filters,
        setSources,
        patchGoogleMaps,
        patchInstagram,
        patchFacebook,
        patchLinkedIn,
        patchSort,
        resetFilters,
    } = filterPanel;
    const { sources, googleMaps, instagram, facebook, linkedin, sort } = filters;

    const displayedSources = SHOW_LINKEDIN_FILTERS_UI
        ? sources
        : sources.filter((s) => s !== LeadSource.LINKEDIN);

    const showGoogleMaps =
        sources.length === 0 ||
        sources.includes(LeadSource.GOOGLE_MAPS) ||
        sources.includes(LeadSource.GOOGLE_MAPS_ADVANCED);
    const showInstagram = sources.length === 0 || sources.includes(LeadSource.INSTAGRAM);
    const showFacebook = sources.length === 0 || sources.includes(LeadSource.FACEBOOK);
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
                            <GoogleMapsSection
                                f={googleMaps}
                                sort={sort.googleMaps}
                                patch={patchGoogleMaps}
                                patchSort={(p) => patchSort({ googleMaps: p })}
                            />
                        ) : null}

                        {showGoogleMaps && showInstagram ? <Separator /> : null}

                        {showInstagram ? (
                            <InstagramSection
                                f={instagram}
                                sort={sort.instagram}
                                patch={patchInstagram}
                                patchSort={(p) => patchSort({ instagram: p })}
                            />
                        ) : null}

                        {(showGoogleMaps || showInstagram) && showFacebook ? <Separator /> : null}

                        {showFacebook ? (
                            <FacebookSection
                                f={facebook}
                                sort={sort.facebook}
                                patch={patchFacebook}
                                patchSort={(p) => patchSort({ facebook: p })}
                            />
                        ) : null}

                        {(showGoogleMaps || showInstagram || showFacebook) && showLinkedIn ? (
                            <Separator />
                        ) : null}

                        {showLinkedIn ? (
                            <LinkedInSection
                                f={linkedin}
                                sort={sort.linkedin}
                                patch={patchLinkedIn}
                                patchSort={(p) => patchSort({ linkedin: p })}
                            />
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
