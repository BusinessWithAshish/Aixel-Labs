import { StringControlledField, StringArrayControlledField, SearchableSelectControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";
import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { ZodSearchableSelectField } from "@/components/common/zod-form-builder";

export const InstagramQueryForm = () => {

    const { countryOptions, cityOptions, stateOptions, isStateFieldDisabled, isCityFieldDisabled, selectedState, setSelectedState } = usePage<UseInstagramFormReturn>();
    return (
        <>
            <StringControlledField
                name="query"
                description="Enter the query to search for leads on Instagram"
                required={false}
            />

            <SearchableSelectControlledField
                name="country"
                description="Select the country to search for leads on Instagram"
                options={countryOptions}
                required={false}
            />

            <ZodSearchableSelectField
                name="state"
                description="Select the state to search for leads on Instagram"
                options={stateOptions}
                disabled={isStateFieldDisabled}
                value={selectedState}
                onChange={setSelectedState}
                required={false}
            />

            <SearchableSelectControlledField
                name="city"
                options={cityOptions}
                description="Enter the city to search for leads on Instagram"
                disabled={isCityFieldDisabled}
                required={false}
            />

            <StringArrayControlledField
                name="hashtags"
                description="Enter the hashtags to search for leads on Instagram"
                required={false}
            />

            <StringArrayControlledField
                name="keywords"
                description="Enter the keywords to search for leads on Instagram"
                required={false}
            />

            <StringArrayControlledField
                name="excludeKeywords"
                description="Enter the keywords to exclude from the search"
                required={false}
            />

            <StringArrayControlledField
                name="excludeHashtags"
                description="Enter the hashtags to exclude from the search"
                required={false}
            />
        </>
    );
};