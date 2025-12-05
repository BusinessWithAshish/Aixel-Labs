"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConfiguration, useForm, useSubmission } from "../_contexts";
import { LocationForm } from "./LocationForm";
import { DirectUrlForm } from "./DirectUrlForm";
import { ConfigurationForm } from "./ConfigurationForm";
import { ResultsSection } from "./ResultsSection";
import { StatusDisplay } from "./StatusDisplay";
import { MapPin, Link2 } from "lucide-react";

export const GenerateLeads = () => {
  const { config } = useConfiguration();
  const { canSubmit, formMode, setFormMode, directUrls, setDirectUrls } = useForm();
  const { submissionState, submitForm } = useSubmission();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await submitForm();
  };

  return (
    <div className="space-y-6">
      <ConfigurationForm />

      {config.isConfigValid ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
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

            <div className="mt-6">
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submissionState.isSubmitting}
                className="w-full"
              >
                {submissionState.isSubmitting ? "Processing..." : "Start Scraping"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">
              Please complete the configuration setup above to access the forms.
            </p>
            {config.validationError && (
              <p className="text-red-600 mt-2 text-sm">
                Error: {config.validationError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {config.isConfigValid && <StatusDisplay />}

      <ResultsSection />
    </div>
  );
};