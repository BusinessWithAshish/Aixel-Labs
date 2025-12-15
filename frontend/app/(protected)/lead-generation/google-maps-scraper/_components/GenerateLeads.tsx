'use client';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DirectUrlForm } from './DirectUrlForm';
import { useForm, useSubmission } from '../_contexts';
import { LocationForm } from './LocationForm';
import { ResultsSection } from './ResultsSection';
import { StatusDisplay } from './StatusDisplay';
import { MapPin, Link2 } from 'lucide-react';
import Image from 'next/image';

export const GenerateLeads = () => {
    const { canSubmit, formMode, setFormMode, directUrls, setDirectUrls } = useForm();
    const { submissionState, submitForm } = useSubmission();

    const handleSubmit = async () => {
        if (!canSubmit) return;
        await submitForm();
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Image src="/google-maps.svg" alt="Google Maps" width={20} height={20} />
                        Generate Google Map Leads
                    </CardTitle>
                </CardHeader>

                <CardContent className="p-4 md:p-6">
                    <Tabs
                        value={formMode}
                        onValueChange={(value) => setFormMode(value as 'location' | 'direct-url')}
                        className="w-full"
                    >
                        <TabsList className="grid w-full grid-cols-2 mb-6">
                            <TabsTrigger value="location" className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span className="hidden sm:inline">Location-Based</span>
                                <span className="sm:hidden">Location</span>
                            </TabsTrigger>
                            <TabsTrigger value="direct-url" className="flex items-center gap-2">
                                <Link2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Direct URL</span>
                                <span className="sm:hidden">URL</span>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="location" className="mt-0">
                            <LocationForm />
                        </TabsContent>

                        <TabsContent value="direct-url" className="mt-0">
                            <DirectUrlForm urls={directUrls} onUrlsChange={setDirectUrls} />
                        </TabsContent>
                    </Tabs>

                    <CardFooter className="flex justify-end">
                        <Button
                            className="m-2 w-fit"
                            onClick={handleSubmit}
                            disabled={!canSubmit || submissionState.isSubmitting}
                        >
                            {submissionState.isSubmitting ? 'Processing...' : 'Start Scraping'}
                        </Button>
                    </CardFooter>
                </CardContent>
            </Card>

            <StatusDisplay />

            <ResultsSection />
        </div>
    );
};
