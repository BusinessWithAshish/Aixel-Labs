'use client';

import { StringArrayControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';

const URLS_FIELD_DESCRIPTION =
    'Paste Google Maps place URLs (one per entry). Place IDs are resolved from each URL automatically.';

export const GoogleMapsAdvancedUrlsForm = () => {
    return <StringArrayControlledField name="urls" description={URLS_FIELD_DESCRIPTION} />;
};
