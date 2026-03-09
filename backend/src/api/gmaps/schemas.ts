import { z } from "zod";

export const GMAPS_REQUEST_SCHEMA = z.object({
  query: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  cities: z.array(z.string()).optional(),
  urls: z.array(z.string()).optional(),
});
