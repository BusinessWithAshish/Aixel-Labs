import {
    StringControlledField,
    StringArrayControlledField,
    SearchableSelectControlledField,
    NumberControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { INSTAGRAM_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/instagram/constants';
import { UseInstagramFormReturn } from '../_hooks/use-instagram-form';

export const InstagramQueryForm = () => {
    const {
        countryOptions,
        cityOptions,
        stateOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    } = usePage<UseInstagramFormReturn>();
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
                required={true}
            />

            <SearchableSelectControlledField
                name="state"
                description="Select the state to search for leads on Instagram"
                options={stateOptions}
                disabled={isStateFieldDisabled}
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

            <NumberControlledField
                name="limit"
                label="Limit"
                description={`Maximum number of Instagram profiles to return (1–${INSTAGRAM_REQUEST_RESULT_LIMIT_MAX}, integer). Defaults to 100.`}
                required={false}
            />
        </>
    );
};