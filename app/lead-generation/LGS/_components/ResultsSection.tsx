"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubmission } from "../_contexts";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-600">
            <pre className="whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {JSON.stringify(submissionState.result, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};