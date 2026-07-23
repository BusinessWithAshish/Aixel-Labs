import {
    StringArrayControlledField,
    SearchableSelectControlledField,
    NumberControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { usePage } from '@/contexts/PageStore';
import { INSTAGRAM_REQUEST_RESULT_LIMIT_MAX } from '@aixellabs/backend/instagram/constants';
import { UseInstagramFormReturn } from '../_hooks/use-instagram-form';

const COUNTRY_FIELD_DESCRIPTION =
    'Country is required so we can correctly parse phone numbers found on profiles (for example, turning a local number into a full international format) and match location details when looking up each account.';

export const InstagramUsernamesForm = () => {
    const { countryOptions } = usePage<UseInstagramFormReturn>();

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
                description="Enter the usernames or Instagram URLs to search for leads on Instagram"
            />

            <NumberControlledField
                name="limit"
                label="Limit"
                description={`Maximum number of profiles to return (1–${INSTAGRAM_REQUEST_RESULT_LIMIT_MAX}, integer). Defaults to 100.`}
                required={false}
            />
        </>
    );
};