'use client';
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePage } from "@/contexts/PageStore";
import { UseInstagramFormReturn } from "../_hooks/use-instagram-form";
import { formName, InstagramQueryForm } from "./InstagramQueryForm";
import { Tabs, TabsTrigger, TabsList, TabsContent } from "@/components/ui/tabs";
import { INSTAGRAM_SCRAPE_SEARCH_FOR } from "@aixellabs/shared/common";
import { InstagramUsernamesForm } from "./InstagramUsernamesForm";
import { InstagramResultsSection } from "./InstagramResultsSection";

export const InstagramSearchFormWrapper = () => {

    const { form, resultsSectionKey, isResultsSectionEnabled } = usePage<UseInstagramFormReturn>();

    return (
        <Card>
            <CardHeader>
                <CardTitle>Instagram Search Form</CardTitle>
                <CardDescription>Enter the search parameters to search for leads on Instagram</CardDescription>
                <CardAction className="flex gap-2 items-center">
                    <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
                    <Button disabled={form.formState.isSubmitting} type="submit" form={formName}>
                        {form.formState.isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue={resultsSectionKey}>
                    <TabsList className="w-full">
                        <TabsTrigger value={INSTAGRAM_SCRAPE_SEARCH_FOR.QUERY}>Query</TabsTrigger>
                        <TabsTrigger value={INSTAGRAM_SCRAPE_SEARCH_FOR.USERNAMES}>Usernames</TabsTrigger>
                        <TabsTrigger className="text-primary dark:text-primary" disabled={!isResultsSectionEnabled} value={resultsSectionKey}>Results</TabsTrigger>
                    </TabsList>
                    <TabsContent value={INSTAGRAM_SCRAPE_SEARCH_FOR.QUERY}>
                        <InstagramQueryForm />
                    </TabsContent>
                    <TabsContent value={INSTAGRAM_SCRAPE_SEARCH_FOR.USERNAMES}>
                        <InstagramUsernamesForm />
                    </TabsContent>
                    <TabsContent value={resultsSectionKey}>
                        <InstagramResultsSection />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};