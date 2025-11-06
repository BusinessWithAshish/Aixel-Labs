"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useSubmission } from "../_contexts";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type TGoogleMapLeadInfo = {
  website: string;
  phoneNumber: string;
  name: string;
  gmapsUrl: string;
  overAllRating: string;
  numberOfReviews: string;
};

type ScrapeResult = {
  founded?: string[];
  foundedLeadsCount?: number;
  allLeads?: TGoogleMapLeadInfo[];
  allLeadsCount?: number;
  stage?: string;
};

export const ResultsSection = () => {
  const { submissionState } = useSubmission();

  if (submissionState.isSubmitting) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-gray-600">Processing your request...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (submissionState.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error: {submissionState.error}
        </AlertDescription>
      </Alert>
    );
  }

  if (submissionState.isSuccess && submissionState.result) {
    const result = submissionState.result as ScrapeResult;
    const foundedCount = result.foundedLeadsCount ?? result.founded?.length ?? 0;
    const detailedCount = result.allLeadsCount ?? result.allLeads?.length ?? 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="detailed" className="w-full">
            <TabsList>
              <TabsTrigger value="founded" className="gap-2">
                Founded Leads
                <Badge variant="secondary" className="ml-1">
                  {foundedCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="detailed" className="gap-2">
                Detailed Leads
                <Badge variant="secondary" className="ml-1">
                  {detailedCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>

            <TabsContent value="founded" className="mt-4">
              <div className="space-y-2">
                {result.founded && result.founded.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 mb-3">
                      Found {foundedCount} business listing URLs
                    </p>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {result.founded.map((url, index) => (
                        <div
                          key={index}
                          className="p-3 bg-gray-50 rounded border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 break-all"
                          >
                            {url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No founded leads available</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="detailed" className="mt-4">
              <div className="space-y-2">
                {result.allLeads && result.allLeads.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 mb-3">
                      Extracted details from {detailedCount} businesses
                    </p>
                    <div className="max-h-96 overflow-y-auto space-y-3">
                      {result.allLeads.map((lead, index) => (
                        <div
                          key={index}
                          className="p-4 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <h3 className="font-semibold text-gray-900">
                                {lead.name !== "N/A" ? lead.name : `Business #${index + 1}`}
                              </h3>
                              {lead.overAllRating !== "N/A" && (
                                <Badge variant="outline">
                                  ⭐ {lead.overAllRating} ({lead.numberOfReviews} reviews)
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              {lead.phoneNumber !== "N/A" && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">Phone:</span>
                                  <span className="text-gray-900">{lead.phoneNumber}</span>
                                </div>
                              )}
                              
                              {lead.website !== "N/A" && (
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">Website:</span>
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 truncate max-w-xs"
                                  >
                                    {lead.website}
                                  </a>
                                </div>
                              )}
                            </div>

                            {lead.gmapsUrl !== "N/A" && (
                              <div className="pt-2 border-t border-gray-100">
                                <a
                                  href={lead.gmapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800 break-all"
                                >
                                  View on Google Maps →
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No detailed leads available</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <div className="text-sm text-gray-600">
                <pre className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200 max-h-96 overflow-y-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  return null;
};