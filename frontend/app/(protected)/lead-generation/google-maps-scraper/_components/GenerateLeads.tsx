'use client';

import {Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle} from '@/components/ui/card';
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
        <div className="space-y-3 h-full w-full">
            <Card className='h-full w-full'>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Image src="/google-maps.svg" alt="Google Maps" width={20} height={20} />
                        Generate Google Map Leads
                    </CardTitle>
                    <CardAction>
                        <Button
                            className="w-fit"
                            onClick={handleSubmit}
                            disabled={!canSubmit || submissionState.isSubmitting}
                        >
                            {submissionState.isSubmitting ? 'Processing...' : 'Start Scraping'}
                        </Button>
                    </CardAction>
                </CardHeader>

                <CardContent className="h-full w-full">
                    <Tabs
                        value={formMode}
                        onValueChange={(value) => setFormMode(value as 'location' | 'direct-url')}
                        className="h-full w-full"
                    >
                        <TabsList className="grid w-full grid-cols-2">
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

                        <TabsContent className='h-full w-full' value="location">
                            <LocationForm />
                        </TabsContent>

                        <TabsContent className='h-full w-full' value="direct-url">
                            <DirectUrlForm urls={directUrls} onUrlsChange={setDirectUrls} />
                        </TabsContent>
                    </Tabs>

                </CardContent>
            </Card>

            <StatusDisplay />

            <ResultsSection />
        </div>
    );
};
