"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfiguration, useForm, useSubmission } from "../_contexts";
import { LocationForm } from "./LocationForm";
import { ConfigurationForm } from "./ConfigurationForm";
import { ResultsSection } from "./ResultsSection";
import { MapPin, Link } from "lucide-react";

export const GenerateLeads = () => {
  const { config } = useConfiguration();
  const { canSubmit } = useForm();
  const { submissionState, submitForm } = useSubmission();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await submitForm();
  };

  return (
    <div className="space-y-6">
      {/* Configuration Setup */}
      <ConfigurationForm />

      {/* Main Form - Only show if config is valid */}
      {config.isConfigValid ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Generate Google Map Leads
            </CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Location Form */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" />
                <h3 className="font-medium">Location-Based Search</h3>
              </div>
              <LocationForm />
            </div>

            {/* ID/URL Form */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4 text-green-500" />
                <h3 className="font-medium">Direct ID/URL Search</h3>
              </div>
            </div>
          </CardContent>

          {/* Submit Button */}
          <div className="px-6 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submissionState.isSubmitting}
              className="w-full"
            >
              {submissionState.isSubmitting ? "Processing..." : "Start Scraping"}
            </Button>
          </div>
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

      {/* Results */}
      <ResultsSection />
    </div>
  );
};