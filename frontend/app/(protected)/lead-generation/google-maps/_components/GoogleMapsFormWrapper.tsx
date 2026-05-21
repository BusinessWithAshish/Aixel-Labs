'use client';

import { FormProvider } from "react-hook-form";
import { Tabs, TabsTrigger, TabsList, TabsContent } from "@/components/ui/tabs";
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { UseGoogleMapsFormReturn } from "../_hooks/use-google-maps-form";
import { usePage } from "@/contexts/PageStore";
import { GoogleMapsQueryForm } from "./GoogleMapsQueryForm";
import { GoogleMapsUrlsForm } from "./GoogleMapsUrlsForm";
import { LeadFormWrapper } from "@/components/common/LeadFormWrappers";
import { FormPresetScraperActions } from "@/components/common/FormPresetScraperActions";

enum GoogleMapsFormInputMode {
    QUERY = 'Query',
    URLS = 'URLs',
}

export const GOOGLE_MAPS_FORM_NAME = 'google-maps-form';

export const GoogleMapsFormWrapper = () => {
    const { form, onSubmit } = usePage<UseGoogleMapsFormReturn>();

    return (
        <FormProvider {...form}>
            <LeadFormWrapper
                config={{
                    title: 'Google Maps Form',
                    description: 'Find leads on Google Maps by using the query or by direct URLs',
                    icon: { src: '/google-maps.svg', alt: 'Google Maps' },
                }}
                actions={
                    <FormPresetScraperActions
                        module={LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS}
                        onSubmit={onSubmit}
                    />
                }
            >
                <Tabs defaultValue={GoogleMapsFormInputMode.QUERY}>
                    <TabsList className="w-full">
                        <TabsTrigger value={GoogleMapsFormInputMode.QUERY}>{GoogleMapsFormInputMode.QUERY}</TabsTrigger>
                        <TabsTrigger value={GoogleMapsFormInputMode.URLS}>{GoogleMapsFormInputMode.URLS}</TabsTrigger>
                    </TabsList>
                    <form
                        className="h-full w-full"
                        id={GOOGLE_MAPS_FORM_NAME}
                        onSubmit={form.handleSubmit(onSubmit)}
                    >
                        <TabsContent className='space-y-3' value={GoogleMapsFormInputMode.QUERY}>
                            <GoogleMapsQueryForm />
                        </TabsContent>
                        <TabsContent className='space-y-3' value={GoogleMapsFormInputMode.URLS}>
                            <GoogleMapsUrlsForm />
                        </TabsContent>
                    </form>
                </Tabs>
            </LeadFormWrapper>
        </FormProvider>
    );
};