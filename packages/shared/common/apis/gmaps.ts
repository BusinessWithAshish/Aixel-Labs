import z from "zod";

export const GOOGLE_MAPS_BASE_URL = "https://www.google.com/maps/search/";

export const GMAPS_SCRAPE_REQUEST_SCHEMA = z.object({
  query: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  cities: z.array(z.string()).optional(),
  urls: z.array(z.url()).optional(),
});

export type GMAPS_SCRAPE_REQUEST = z.infer<typeof GMAPS_SCRAPE_REQUEST_SCHEMA>;

export type GMAPS_SCRAPE_LEAD_INFO = {
  placeId: string | null;
  website: string | null;
  phoneNumber: string | null;
  name: string | null;
  gmapsUrl: string | null;
  overAllRating: string | null;
  numberOfReviews: string | null;
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
  data?: StreamMessage["data"],
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
  type: string,
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

export const generateGoogleMapsUrls = (
  data: GMAPS_SCRAPE_REQUEST,
): string[] => {
  const urls: string[] = [];

  data.cities?.forEach((city: string) => {
    if (!city) return;
    const formattedQuery = data.query
      ?.toLowerCase()
      .trim()
      .replace(/\s+/g, "+");

    const location = `${city}, ${data.state ?? ""}, ${data.country ?? ""}`;
    const formattedLocation = location.replace(/\s+/g, "+");

    const searchTerm = `${formattedQuery}+in+${formattedLocation}`;
    const encodedSearchTerm = encodeURIComponent(searchTerm).replace(
      /%2B/g,
      "+",
    );

    const finalUrl = `${GOOGLE_MAPS_BASE_URL}${encodedSearchTerm}`;
    urls.push(finalUrl);
  });

  return urls;
};
