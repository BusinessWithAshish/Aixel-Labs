'use client';
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { InstagramQueryForm } from "./InstagramQueryForm";
import { Tabs, TabsTrigger, TabsList, TabsContent } from "@/components/ui/tabs";
import { InstagramUsernamesForm } from './InstagramUsernamesForm';
import { FormProvider } from "react-hook-form";

enum InstagramFormMode {
    QUERY = 'Query',
    USERNAMES = 'Usernames',
}

export const instagramSearchFormName = 'instagram-search-form';

export const InstagramSearchFormWrapper = () => {

    const { form, onSubmit } = usePage<UseInstagramFormReturn>();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Instagram Search Form</CardTitle>
                <CardDescription>Enter the search parameters to search for leads on Instagram</CardDescription>
                <CardAction className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
                    <Button
                        form={instagramSearchFormName}
                        disabled={form.formState.isSubmitting}
                        type="submit"
                    >
                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue={InstagramFormMode.QUERY}>

                    <TabsList className="w-full">
                        <TabsTrigger value={InstagramFormMode.QUERY}>Query</TabsTrigger>
                        <TabsTrigger value={InstagramFormMode.USERNAMES}>Usernames/URL(s)</TabsTrigger>

                    </TabsList>
                    <FormProvider {...form}>
                        <form
                            className="h-full w-full"
                            id={instagramSearchFormName}
                            onSubmit={form.handleSubmit(onSubmit)}
                        >
                            <TabsContent className="space-y-3" value={InstagramFormMode.QUERY}>
                                <InstagramQueryForm />
                            </TabsContent>
                            <TabsContent className="space-y-3" value={InstagramFormMode.USERNAMES}>
                                <InstagramUsernamesForm />
                            </TabsContent>
                        </form>
                    </FormProvider>
                </Tabs>
            </CardContent>
        </Card>
    );
};