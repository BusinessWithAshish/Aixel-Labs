import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import { z } from "zod";

export enum GSEARCH_TIME_FILTER {
  LAST_HOUR = "qdr:h",
  LAST_24_HOURS = "qdr:d",
  LAST_WEEK = "qdr:w",
  LAST_MONTH = "qdr:m",
  LAST_YEAR = "qdr:y",
}

export type GSEARCH_INJECTOR_PROPS = {
  searchQuery: string;
  totalPages: number;
  language: string;
  tbs: string | null;
  gl: string;
  near: string;
};

export type GSEARCH_RESPONSE = {
  url: string | null;
  title: string | null;
  snippet: string | null;
  index: number | null;
};

export type GSEARCH_REQUEST = z.infer<typeof GSEARCH_REQUEST_SCHEMA>;
