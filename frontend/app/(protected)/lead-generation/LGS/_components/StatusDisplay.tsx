"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSubmission } from "../_contexts";
import { Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

export const StatusDisplay = () => {
  const { submissionState } = useSubmission();

  // Don't show anything if not submitting and no error
  if (!submissionState.isSubmitting && !submissionState.error && !submissionState.isSuccess) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardContent className="p-6 space-y-4">
        {/* Status Header */}
        <div className="flex items-center gap-3">
          {submissionState.isSubmitting && (
            <>
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900">Processing Request</h3>
                <p className="text-sm text-blue-700">{submissionState.currentStatus}</p>
              </div>
            </>
          )}
          
          {submissionState.isSuccess && (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900">Completed Successfully</h3>
                <p className="text-sm text-green-700">{submissionState.currentStatus}</p>
              </div>
            </>
          )}
          
          {submissionState.error && (
            <>
              <XCircle className="w-5 h-5 text-red-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Error Occurred</h3>
                <p className="text-sm text-red-700">{submissionState.error}</p>
              </div>
            </>
          )}
        </div>

        {/* Progress Bar */}
        {submissionState.isSubmitting && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700">Progress</span>
              <span className="font-medium text-blue-900">
                {submissionState.currentProgress.toFixed(0)}%
              </span>
            </div>
            <Progress value={submissionState.currentProgress} className="h-2" />
          </div>
        )}

        {/* Phase Indicator */}
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

        {/* Recent Messages (Last 3) */}
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
      </CardContent>
    </Card>
  );
};

