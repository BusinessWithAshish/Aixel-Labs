import { z } from "zod";
import { Country, State } from "country-state-city";
import { TGmapsScrapeResult, StreamMessage } from "../utlis/types";

export type FormData = {
  query: string;
  selectedCountry: string;
  selectedState: string;
  selectedCities: string[];
};

export type StreamingCallbacks = {
  onStreamStart: () => void;
  onStreamData: (streamMessage: StreamMessage) => void;
  onStreamComplete: (resultData: TGmapsScrapeResult) => void;
  onStreamError: (error: string) => void;
  onStreamEnd: () => void;
};

// Validation schema for query data
export const querySchema = z.object({
  query: z.string(),
  country: z.string(),
  states: z.array(z.object({
    name: z.string(),
    cities: z.array(z.string())
  })),
});

// Transform form data to API format
export const transformFormData = (formData: FormData) => {
  return {
    query: formData.query,
    country: Country.getCountryByCode(formData.selectedCountry)?.name,
    states: [{
      name: State.getStateByCodeAndCountry(formData.selectedState, formData.selectedCountry)?.name,
      cities: formData.selectedCities
    }],
  };
};

// Validate form data
export const validateFormData = (formData: FormData): string | null => {
  if (!formData.selectedCountry || !formData.selectedState || !formData.query || !formData.selectedCities.length) {
    return "Please select a country, state, query, and cities";
  }
  return null;
};

// Process streaming response
export const processStreamingResponse = async (
  response: Response,
  callbacks: StreamingCallbacks
): Promise<void> => {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body reader available");
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const streamMessage = JSON.parse(line.slice(6)) as StreamMessage;
          callbacks.onStreamData(streamMessage);
          
          // Handle completion
          if (streamMessage.type === 'complete' && streamMessage.data?.stage === 'final_results') {
            const resultData: TGmapsScrapeResult = {
              success: true,
              data: {
                founded: streamMessage.data.founded || [],
                foundedLeadsCount: streamMessage.data.foundedLeadsCount || 0,
                allLeads: streamMessage.data.allLeads || [],
                allLeadsCount: streamMessage.data.allLeadsCount || 0,
              }
            };
            callbacks.onStreamComplete(resultData);
          }
          
          // Handle errors
          if (streamMessage.type === 'error') {
            callbacks.onStreamError(streamMessage.message);
          }
        } catch (e) {
          console.error('Error parsing stream data:', e);
        }
      }
    }
  }
};

// Create error stream message
export const createErrorStreamMessage = (error: unknown): StreamMessage => ({
  type: 'error',
  message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
  timestamp: new Date().toISOString()
});
