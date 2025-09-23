"use client";

import { useState, useCallback } from "react";
import { getBeUrl } from "@/helpers/get-be-url";
import { TGmapsScrapeResult, StreamMessage } from "@/app/lead-generation/LGS/utlis/types";
import { useEC2Manager } from "@/hooks/use-ec2-manager";
import { useConnectionConfig } from "./useConnectionConfig";
import { EC2Phase } from "@/lib/aws-ec2-manager";
import { 
  FormData, 
  StreamingCallbacks, 
  transformFormData, 
  validateFormData, 
  processStreamingResponse,
  createErrorStreamMessage 
} from "../_utils/streaming-utils";

type StreamingState = {
  isLoading: boolean;
  isStreaming: boolean;
  streamData: StreamMessage | null;
  currentPhase: number;
  data: TGmapsScrapeResult | undefined;
};

type UseUnifiedLeadStreamingReturn = {
  streamingState: StreamingState;
  ec2State: ReturnType<typeof useEC2Manager>['state'];
  connectionConfig: ReturnType<typeof useConnectionConfig>['config'];
  startStreaming: (formData: FormData) => Promise<void>;
  resetStreaming: () => void;
  stopEC2Instance: () => Promise<void>;
  isFormDisabled: boolean;
  getButtonText: () => string;
};

const initialStreamingState: StreamingState = {
  isLoading: false,
  isStreaming: false,
  streamData: null,
  currentPhase: 0,
  data: undefined,
};

export const useUnifiedLeadStreaming = (): UseUnifiedLeadStreamingReturn => {
  const [streamingState, setStreamingState] = useState<StreamingState>(initialStreamingState);
  const ec2Manager = useEC2Manager();
  const connectionConfig = useConnectionConfig();

  const resetStreaming = useCallback(() => {
    setStreamingState(initialStreamingState);
    ec2Manager.reset();
  }, [ec2Manager]);

  const startStreaming = useCallback(async (formData: FormData) => {
    // Validate form data
    const validationError = validateFormData(formData);
    if (validationError) {
      alert(validationError);
      return;
    }

    // Validate connection configuration
    if (!connectionConfig.config.isConfigValid) {
      alert(connectionConfig.config.validationError || "Please configure your connection settings");
      return;
    }

    try {
      setStreamingState(prev => ({
        ...prev,
        isLoading: true,
        isStreaming: true,
        streamData: null,
        currentPhase: 0,
        data: undefined,
      }));

      let backendURL: URL;

      if (connectionConfig.config.useLocalDev) {
        // Local Development Mode: Use localhost
        backendURL = getBeUrl("/gmaps/scrape", "http://localhost:8100");
      } else if (connectionConfig.config.useAWS) {
        // AWS Mode: Start EC2 instance and get public IP
        if (!ec2Manager.isReadyForApiCalls()) {
          await ec2Manager.startInstance();
        }

        // Wait for EC2 to be ready
        while (!ec2Manager.isReadyForApiCalls()) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const publicIp = ec2Manager.getPublicIp();
        if (!publicIp) {
          throw new Error('EC2 instance public IP not available');
        }

        backendURL = getBeUrl("/gmaps/scrape", `http://${publicIp}:8100`);
      } else {
        // Manual Mode: Use provided BE URL
        backendURL = getBeUrl("/gmaps/scrape", connectionConfig.config.beUrl);
      }

      const queryData = transformFormData(formData);

      const response = await fetch(backendURL.toString(), {
        method: "POST",
        body: JSON.stringify(queryData),
        headers: { "Content-Type": "application/json" },
      });

      const callbacks: StreamingCallbacks = {
        onStreamStart: () => {
          setStreamingState(prev => ({ ...prev, isStreaming: true }));
        },
        onStreamData: (streamMessage) => {
          setStreamingState(prev => ({
            ...prev,
            streamData: streamMessage,
            currentPhase: streamMessage.data?.phase || prev.currentPhase,
          }));
        },
        onStreamComplete: (resultData) => {
          setStreamingState(prev => ({
            ...prev,
            data: resultData,
            isStreaming: false,
          }));
        },
        onStreamError: (error) => {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
          }));
          console.error('Streaming error:', error);
        },
        onStreamEnd: () => {
          setStreamingState(prev => ({ ...prev, isLoading: false }));
        },
      };

      await processStreamingResponse(response, callbacks);
    } catch (error) {
      console.error("Failed to start streaming:", error);
      setStreamingState(prev => ({
        ...prev,
        isStreaming: false,
        streamData: createErrorStreamMessage(error),
      }));
    } finally {
      setStreamingState(prev => ({
        ...prev,
        isLoading: false,
      }));
    }
  }, [ec2Manager, connectionConfig]);

  const stopEC2Instance = useCallback(async () => {
    if (connectionConfig.config.useAWS) {
      try {
        await ec2Manager.stopInstance();
      } catch (error) {
        console.error('Failed to stop EC2 instance:', error);
      }
    }
  }, [ec2Manager, connectionConfig]);

  const isFormDisabled = useCallback(() => {
    return streamingState.isLoading || 
           streamingState.isStreaming || 
           (connectionConfig.config.useAWS && ec2Manager.state.isLoading) ||
           !connectionConfig.config.isConfigValid;
  }, [streamingState, connectionConfig, ec2Manager]);

  const getButtonText = useCallback(() => {
    if (!connectionConfig.config.isConfigValid) {
      return "Configure Connection";
    }
    
    if (streamingState.isStreaming) {
      return "Streaming...";
    }
    
    if (connectionConfig.config.useAWS && ec2Manager.state.isLoading) {
      return "Starting EC2...";
    }
    
    if (streamingState.isLoading) {
      return "Starting...";
    }
    
    return "Start Scraping";
  }, [streamingState, connectionConfig, ec2Manager]);

  return {
    streamingState,
    ec2State: ec2Manager.state,
    connectionConfig: connectionConfig.config,
    startStreaming,
    resetStreaming,
    stopEC2Instance,
    isFormDisabled: isFormDisabled(),
    getButtonText,
  };
};
