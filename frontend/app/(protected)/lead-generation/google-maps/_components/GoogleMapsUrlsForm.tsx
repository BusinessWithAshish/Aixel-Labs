import { StringArrayControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";


export const GoogleMapsUrlsForm = () => {
    return (
        <>
            <StringArrayControlledField
                name="urls"
                label="URLs"
                description="Enter the URLs of the Google Maps places to scrape"
            />
        </>
    );
};