import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { StringArrayControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";
import { FormProvider } from "react-hook-form";

export const formName = 'instagram-usernames-form';
export const InstagramUsernamesForm = () => {

    const { form, onSubmit } = usePage<UseInstagramFormReturn>();

    return (
        <FormProvider {...form}>
            <form
                className="space-y-3 h-full w-full p-1"
                id={formName}
                onSubmit={form.handleSubmit(onSubmit)}
            >
                <StringArrayControlledField
                    name="usernames"
                    description="Enter the usernames or instagram urls to search for leads on Instagram"
                />

            </form>
        </FormProvider>
    );
};