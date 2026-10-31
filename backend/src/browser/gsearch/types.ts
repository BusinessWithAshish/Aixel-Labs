import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import { z } from "zod";

export { GSEARCH_TIME_FILTER } from "./constants";

export type GSEARCH_INJECTOR_PROPS = {
  initialUrl: string;
  totalPages: number;
};

export type GSEARCH_RESPONSE = {
  url: string | null;
  title: string | null;
  snippet: string | null;
  index: number | null;
};

export type GSEARCH_REQUEST = z.infer<typeof GSEARCH_REQUEST_SCHEMA>;
