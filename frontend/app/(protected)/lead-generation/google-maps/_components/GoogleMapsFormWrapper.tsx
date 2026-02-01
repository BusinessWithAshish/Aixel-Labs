'use client';

import { Card, CardTitle, CardHeader, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import Image from "next/image";
import { GoogleMapsQueryForm } from "./GoogleMapsQueryForm";
import { Button } from "@/components/ui/button";
import { UseGoogleMapsFormReturn } from "../_hooks/use-google-maps-form";
import { usePage } from "@/contexts/PageStore";
import { Tabs, TabsTrigger, TabsList, TabsContent } from "@/components/ui/tabs";
import { FormProvider } from "react-hook-form";
import { GoogleMapsUrlsForm } from "./GoogleMapsUrlsForm";

enum GoogleMapsFormInputMode {
    QUERY = 'Query',
    URLS = 'URLs',
}

export const GOOGLE_MAPS_FORM_NAME = 'google-maps-form';

export const GoogleMapsFormWrapper = () => {

    const { form, onSubmit } = usePage<UseGoogleMapsFormReturn>();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Image src="/google-maps.svg" alt="Google Maps" width={20} height={20} />
                    <span>Google Maps Form</span>
                </CardTitle>
                <CardDescription>
                    Find leads on Google Maps by using the query or by direct URLs
                </CardDescription>
                <CardAction className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
                    <Button disabled={form.formState.isSubmitting} type="submit" form={GOOGLE_MAPS_FORM_NAME}>
                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue={GoogleMapsFormInputMode.QUERY}>
                    <TabsList className="w-full">
                        <TabsTrigger value={GoogleMapsFormInputMode.QUERY}>{GoogleMapsFormInputMode.QUERY}</TabsTrigger>
                        <TabsTrigger value={GoogleMapsFormInputMode.URLS}>{GoogleMapsFormInputMode.URLS}</TabsTrigger>
                    </TabsList>
                    <FormProvider {...form}>
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
                    </FormProvider>

                </Tabs>
            </CardContent>
        </Card>
    );
};