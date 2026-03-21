import { StringArrayControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";

export const InstagramUsernamesForm = () => {

    return (
        <StringArrayControlledField
            name="entities"
            description="Enter the usernames or Instagram URLs to search for leads on Instagram"
        />
    );
};