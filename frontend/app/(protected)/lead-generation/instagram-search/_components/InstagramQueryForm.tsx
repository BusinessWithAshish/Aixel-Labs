import { usePage } from "@/contexts/PageStore"
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form"
import { FormProvider } from "react-hook-form"
import { StringControlledField, StringArrayControlledField } from "@/components/common/zod-form-builder/ZodControlledFields";

export const formName = 'instagram-query-form';
export const InstagramQueryForm = () => {

    const { form, onSubmit } = usePage<UseInstagramFormReturn>();

    return (
        <FormProvider {...form}>
            <form
                className="space-y-3 h-full w-full p-1"
                id={formName}
                onSubmit={form.handleSubmit(onSubmit)}
            >

                <StringControlledField
                    name="query"
                    description="Enter the query to search for leads on Instagram"
                    required={false}
                />

                <StringArrayControlledField
                    name="hashtags"
                    description="Enter the hashtags to search for leads on Instagram"
                />

                <StringArrayControlledField
                    name="keywords"
                    description="Enter the keywords to search for leads on Instagram"
                />

                <StringArrayControlledField
                    name="excludeKeywords"
                    description="Enter the keywords to exclude from the search"
                />

                <StringArrayControlledField
                    name="excludeHashtags"
                    description="Enter the hashtags to exclude from the search"
                />


            </form>
        </FormProvider>
    );
};