import z from "zod";

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

export enum StreamMessageType {
  PROGRESS = "progress",
  STATUS = "status",
  ERROR = "error",
  COMPLETE = "complete",
}

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

export const serializeStreamMessage = (message: StreamMessage): string => {
  return `data: ${JSON.stringify(message)}\n\n`;
};

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

export const SSEParser = () => {
  let buffer = "";

  return {
    parseChunk: (chunk: string): StreamMessage[] => {
      buffer += chunk;
      const messages: StreamMessage[] = [];
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (part.trim().startsWith("data: ")) {
          try {
            const jsonStr = part.trim().slice(6);
            const message: StreamMessage = JSON.parse(jsonStr);
            messages.push(message);
          } catch (error) {}
        }
      }

      return messages;
    },

    flush: (): StreamMessage[] => {
      if (!buffer.trim()) {
        return [];
      }

      const messages: StreamMessage[] = [];
      const parts = buffer.split("\n\n").filter((msg) => msg.trim());

      for (const part of parts) {
        if (part.trim().startsWith("data: ")) {
          try {
            const jsonStr = part.trim().slice(6);
            const message: StreamMessage = JSON.parse(jsonStr);
            messages.push(message);
          } catch (error) {}
        }
      }

      buffer = "";
      return messages;
    },

    reset: (): void => {
      buffer = "";
    },
  };
};

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

export const generateGoogleMapsUrls = (data: GMAPS_SCRAPE_REQUEST): string[] => {
  const urls: string[] = [];

  data.states.forEach((state: { name: string; cities: string[] }) => {
    state.cities.forEach((city: string) => {
      const formattedQuery = data.query
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "+");

      const location = `${city}, ${state.name}, ${data.country}`;
      const formattedLocation = location.replace(/\s+/g, "+");

      const searchTerm = `${formattedQuery}+in+${formattedLocation}`;
      const encodedSearchTerm = encodeURIComponent(searchTerm).replace(
        /%2B/g,
        "+"
      );

      const finalUrl = `${GOOGLE_MAPS_BASE_URL}${encodedSearchTerm}`;
      urls.push(finalUrl);
    });
  });

  return urls;
};
