import {
    StringControlledField,
    StringArrayControlledField,
    SearchableSelectControlledField,
    NumberControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { FACEBOOK_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/facebook/constants';
import { UseFacebookFormReturn } from '../_hooks/use-facebook-form';

export const FacebookQueryForm = () => {
    const {
        countryOptions,
        cityOptions,
        stateOptions,
        isStateFieldDisabled,
        isCityFieldDisabled,
    } = usePage<UseFacebookFormReturn>();

    return (
        <>
            <StringControlledField
                name="query"
                description="Enter the query to search for Facebook business Pages"
                required={false}
            />

            <SearchableSelectControlledField
                name="country"
                description="Select the country to search for Facebook Pages"
                options={countryOptions}
                required={true}
            />

            <SearchableSelectControlledField
                name="state"
                description="Select the state to search for Facebook Pages"
                options={stateOptions}
                disabled={isStateFieldDisabled}
                required={false}
            />

            <SearchableSelectControlledField
                name="city"
                options={cityOptions}
                description="Enter the city to search for Facebook Pages"
                disabled={isCityFieldDisabled}
                required={false}
            />

            <StringArrayControlledField
                name="keywords"
                description="Enter keywords to bias Page discovery"
                required={false}
            />

            <StringArrayControlledField
                name="excludeKeywords"
                description="Enter keywords to exclude from the search"
                required={false}
            />

            <NumberControlledField
                name="limit"
                label="Limit"
                description={`Maximum number of Pages to return (1–${FACEBOOK_REQUEST_RESULT_LIMIT_MAX}, integer). Defaults to 100.`}
                required={false}
            />
        </>
    );
};
