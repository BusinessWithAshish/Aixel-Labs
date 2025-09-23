"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertCircle, Server, Play, Wifi, Terminal, Cloud } from "lucide-react";
import { StreamMessage } from "@/app/lead-generation/LGS/utlis/types";
import { EC2Phase } from "@/lib/aws-ec2-manager";

type UnifiedStreamingProgressProps = {
  isStreaming: boolean;
  streamData: StreamMessage | null;
  currentPhase: number;
  useLocalDev: boolean;
  useAWS: boolean;
  ec2Phase?: EC2Phase;
  ec2Message?: string;
  ec2Progress?: number;
  ec2Error?: string;
  beUrl?: string;
};

export const UnifiedStreamingProgress = ({ 
  isStreaming, 
  streamData, 
  currentPhase,
  useLocalDev,
  useAWS,
  ec2Phase,
  ec2Message,
  ec2Progress,
  ec2Error,
  beUrl
}: UnifiedStreamingProgressProps) => {
  if (!isStreaming && !streamData && !useAWS && !useLocalDev) return null;

  const getEC2PhaseIcon = (phase: EC2Phase) => {
    switch (phase) {
      case EC2Phase.STARTING:
        return <Play className="w-5 h-5 text-blue-500" />;
      case EC2Phase.WAITING_FOR_READY:
        return <Wifi className="w-5 h-5 text-yellow-500" />;
      case EC2Phase.EXECUTING_COMMANDS:
        return <Terminal className="w-5 h-5 text-purple-500" />;
      case EC2Phase.READY:
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case EC2Phase.ERROR:
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Cloud className="w-5 h-5 text-gray-500" />;
    }
  };

  const getEC2PhaseText = (phase: EC2Phase) => {
    switch (phase) {
      case EC2Phase.STARTING:
        return "Starting EC2 instance";
      case EC2Phase.WAITING_FOR_READY:
        return "Waiting for instance to be ready";
      case EC2Phase.EXECUTING_COMMANDS:
        return "Starting backend server";
      case EC2Phase.READY:
        return "Backend server ready";
      case EC2Phase.ERROR:
        return "EC2 Error";
      default:
        return "EC2 Status";
    }
  };

  const getPhaseIcon = (phase: number) => {
    if (phase === 1) return "🔍";
    if (phase === 2) return "📋";
    return "⚙️";
  };

  const getPhaseText = (phase: number) => {
    if (phase === 1) return "Searching for business listings";
    if (phase === 2) return "Extracting business details";
    return "Processing";
  };

  const getStatusIcon = () => {
    if (isStreaming) {
      return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    }
    if (streamData?.type === 'complete') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (streamData?.type === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    return <div className="w-5 h-5 rounded-full bg-blue-500" />;
  };

  return (
    <div className="space-y-4">
      {/* Local Development Status */}
      {useLocalDev && (
        <Card className="mb-4 border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-green-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-700">
                  Local Development Mode
                </h3>
                <p className="text-sm text-gray-600">
                  Connected to localhost backend
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Status Card */}
      {useAWS && ec2Phase && (
        <Card className="mb-4 border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {getEC2PhaseIcon(ec2Phase)}
              <div className="flex-1">
                <h3 className="font-semibold text-blue-700">
                  {getEC2PhaseText(ec2Phase)}
                </h3>
                <p className="text-sm text-gray-600">{ec2Message}</p>
                {ec2Error && (
                  <p className="text-sm text-red-600 mt-1">{ec2Error}</p>
                )}
              </div>
            </div>
            
            {ec2Progress !== undefined && ec2Progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>EC2 Progress</span>
                  <span>{Math.round(ec2Progress)}%</span>
                </div>
                <Progress value={ec2Progress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Mode Status */}
      {!useAWS && beUrl && (
        <Card className="mb-4 border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-green-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-700">
                  Manual Mode - Direct Connection
                </h3>
                <p className="text-sm text-gray-600">
                  Connected to: {beUrl}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Streaming Status Card */}
      {(isStreaming || streamData) && (
        <Card className="mb-4 border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {getStatusIcon()}
              <div className="flex-1">
                <h3 className="font-semibold text-green-700">
                  {getPhaseIcon(currentPhase)} {getPhaseText(currentPhase)}
                </h3>
                {streamData && (
                  <p className="text-sm text-gray-600">{streamData.message}</p>
                )}
              </div>
            </div>
            
            {streamData?.data?.percentage !== undefined && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>API Progress</span>
                  <span>{streamData.data.percentage}%</span>
                </div>
                <Progress value={streamData.data.percentage} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
