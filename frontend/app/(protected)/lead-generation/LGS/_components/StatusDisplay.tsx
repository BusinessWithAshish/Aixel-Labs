"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useSubmission } from "../_contexts";
import { Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

export const StatusDisplay = () => {
  const { submissionState } = useSubmission();

  if (!submissionState.isSubmitting && !submissionState.error && !submissionState.isSuccess) {
    return null;
  }

  return (
    <div className="space-y-4">
      {submissionState.isSubmitting && (
        <Alert className="border-blue-200 bg-blue-50">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <AlertTitle className="text-blue-900">Processing Request</AlertTitle>
          <AlertDescription className="space-y-4 mt-3">
            <p className="text-blue-700">{submissionState.currentStatus}</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-700">Progress</span>
                <span className="font-medium text-blue-900">
                  {submissionState.currentProgress.toFixed(0)}%
                </span>
              </div>
              <Progress value={submissionState.currentProgress} className="h-2 bg-blue-200" />
            </div>

            {submissionState.currentPhase !== null && (
              <div className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-blue-700">
                  Phase {submissionState.currentPhase}
                  {submissionState.currentPhase === 1 && " - Searching for business listings"}
                  {submissionState.currentPhase === 2 && " - Extracting business details"}
                </span>
              </div>
            )}

            {submissionState.messages.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-blue-200">
                <p className="text-xs font-medium text-blue-900 mb-2">Recent Activity:</p>
                {submissionState.messages
                  .slice(-3)
                  .reverse()
                  .map((msg, idx) => (
                    <div
                      key={`${msg.timestamp}-${idx}`}
                      className="text-xs text-blue-700 flex items-start gap-2"
                    >
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span className="flex-1">{msg.message}</span>
                      {msg.data?.current && msg.data?.total && (
                        <span className="text-blue-500 font-medium">
                          {msg.data.current}/{msg.data.total}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {submissionState.isSuccess && !submissionState.isSubmitting && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">Completed Successfully</AlertTitle>
          <AlertDescription className="text-green-700">
            {submissionState.currentStatus || "Lead generation completed successfully"}
          </AlertDescription>
        </Alert>
      )}

      {submissionState.error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error Occurred</AlertTitle>
          <AlertDescription>{submissionState.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

