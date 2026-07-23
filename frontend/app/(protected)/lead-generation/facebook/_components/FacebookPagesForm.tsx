import {
    StringArrayControlledField,
    SearchableSelectControlledField,
    NumberControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { FACEBOOK_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/facebook/constants';
import { UseFacebookFormReturn } from '../_hooks/use-facebook-form';

const COUNTRY_FIELD_DESCRIPTION =
    'Country is required so we can correctly parse phone numbers found on Pages and match location details when looking up each Page.';

export const FacebookPagesForm = () => {
    const { countryOptions } = usePage<UseFacebookFormReturn>();

    return (
        <>
            <SearchableSelectControlledField
                name="country"
                description={COUNTRY_FIELD_DESCRIPTION}
                options={countryOptions}
                required={true}
            />

            <StringArrayControlledField
                name="entities"
                description="Enter Facebook Page vanity names or full Page URLs (e.g. Starbucks or https://www.facebook.com/Starbucks)"
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
