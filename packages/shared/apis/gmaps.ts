// GMAPS API Types and Utilities
import z from "zod";

// Constants
export const GOOGLE_MAPS_BASE_URL = "https://www.google.com/maps/search/";

export const GMAPS_SCRAPE_REQUEST_SCHEMA = z.object({
  query: z.string(),
  country: z.string(),
  states: z.array(
    z.object({
      name: z.string(),
      cities: z.array(z.string()),
    })
  ),
});
export type GMAPS_SCRAPE_REQUEST = z.infer<typeof GMAPS_SCRAPE_REQUEST_SCHEMA>;

export type GMAPS_SCRAPE_LEAD_INFO = {
  id?: string;
  website: string;
  phoneNumber: string;
  name: string;
  gmapsUrl: string;
  overAllRating: string;
  numberOfReviews: string;
};

export type GMAPS_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: GMAPS_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};

// ============================================================================
// Stream Messaging Types and Utilities
// ============================================================================

// Stream message type enum
export enum StreamMessageType {
  PROGRESS = "progress",
  STATUS = "status",
  ERROR = "error",
  COMPLETE = "complete",
}

// Stream message structure
export type StreamMessage = {
  type: StreamMessageType;
  message: string;
  data?: {
    current?: number;
    total?: number;
    percentage?: number;
    stage?: string;
    batch?: number;
    browser?: number;
    phase?: number;
    error?: string;
    [key: string]: unknown;
  };
  timestamp: string;
};

// Utility to serialize stream messages (includes SSE format with data: prefix and \n\n delimiter)
export const serializeStreamMessage = (message: StreamMessage): string => {
  return `data: ${JSON.stringify(message)}\n\n`;
};

// Helper to create stream messages with automatic timestamp
export const createStreamMessage = (
  type: StreamMessageType,
  message: string,
  data?: StreamMessage["data"]
): StreamMessage => {
  return {
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
};

// SSE Parser for Frontend
export class SSEParser {
  private buffer: string = "";

  /**
   * Parse incoming SSE data chunks
   * @param chunk - The raw string chunk from the stream
   * @returns Array of parsed StreamMessage objects
   */
  parseChunk(chunk: string): StreamMessage[] {
    this.buffer += chunk;
    const messages: StreamMessage[] = [];

    // Split by SSE message delimiter (\n\n)
    const parts = this.buffer.split("\n\n");

    // Keep the last incomplete part in the buffer
    this.buffer = parts.pop() || "";

    // Process complete messages
    for (const part of parts) {
      if (part.trim().startsWith("data: ")) {
        try {
          const jsonStr = part.trim().slice(6); // Remove 'data: ' prefix
          const message: StreamMessage = JSON.parse(jsonStr);
          messages.push(message);
        } catch (error) {
          // Silently skip invalid messages
        }
      }
    }

    return messages;
  }

  /**
   * Flush any remaining buffer content (call when stream ends)
   * @returns Array of parsed StreamMessage objects from remaining buffer
   */
  flush(): StreamMessage[] {
    if (!this.buffer.trim()) {
      return [];
    }

    const messages: StreamMessage[] = [];
    const parts = this.buffer.split("\n\n").filter((msg) => msg.trim());

    for (const part of parts) {
      if (part.trim().startsWith("data: ")) {
        try {
          const jsonStr = part.trim().slice(6);
          const message: StreamMessage = JSON.parse(jsonStr);
          messages.push(message);
        } catch (error) {
          // Silently skip invalid messages
        }
      }
    }

    this.buffer = "";
    return messages;
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = "";
  }
}

// Type guard functions
export const isStreamMessageType = (
  type: string
): type is StreamMessageType => {
  return Object.values(StreamMessageType).includes(type as StreamMessageType);
};

export const isCompleteMessage = (message: StreamMessage): boolean => {
  return message.type === StreamMessageType.COMPLETE;
};

export const isErrorMessage = (message: StreamMessage): boolean => {
  return message.type === StreamMessageType.ERROR;
};

export const isProgressMessage = (message: StreamMessage): boolean => {
  return message.type === StreamMessageType.PROGRESS;
};

export const isStatusMessage = (message: StreamMessage): boolean => {
  return message.type === StreamMessageType.STATUS;
};

// Utility functions
export function generateGoogleMapsUrls(data: GMAPS_SCRAPE_REQUEST): string[] {
  const urls: string[] = [];

  data.states.forEach((state: { name: string; cities: string[] }) => {
    state.cities.forEach((city: string) => {
      // Clean and format the query
      const formattedQuery = data.query
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "+");

      // Create location string: City, State, Country
      const location = `${city}, ${state.name}, ${data.country}`;
      const formattedLocation = location
        .replace(/\s+/g, "+")
        .replace(/,/g, ",");

      // Construct the final URL
      const searchTerm = `${formattedQuery}+in+${formattedLocation}`;

      // URL encode the entire search term
      const encodedSearchTerm = encodeURIComponent(searchTerm).replace(
        /%2B/g,
        "+"
      );

      const finalUrl = `${GOOGLE_MAPS_BASE_URL}${encodedSearchTerm}`;

      urls.push(finalUrl);
    });
  });

  return urls;
}
