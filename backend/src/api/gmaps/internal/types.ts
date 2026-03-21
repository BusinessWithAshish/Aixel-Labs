import { z } from "zod";
import { GMAPS_REQUEST_SCHEMA } from "../schemas";

export type GMAPS_INTERNAL_REQUEST = z.infer<typeof GMAPS_REQUEST_SCHEMA>;

export type GMAPS_INTERNAL_RESPONSE = {
  id: string | null;
  placeId: string | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: string[] | null;
  gmapsUrl: string | null;
};
