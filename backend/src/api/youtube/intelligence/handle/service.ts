import type { z } from "zod";
import type { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../../handle/schemas";
import { fetchYoutubeHandle } from "../../handle/helpers";
import { enrichHandleResults } from "./enrich";
import type { YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE } from "./types";

export type ResolveHandleInput = z.infer<typeof YOUTUBE_HANDLE_REQUEST_SCHEMA>;

export async function resolveHandleService(
  input: ResolveHandleInput,
): Promise<YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE> {
  const raw = await fetchYoutubeHandle(input);
  return enrichHandleResults(raw);
}
