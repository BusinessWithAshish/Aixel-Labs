import { z } from "zod";

import { LINE_FINDER_LIMITS, LINE_FINDER_SPEAKER } from "./constants";

const NAME = z.string().trim().min(2).max(LINE_FINDER_LIMITS.NAME_MAX_LENGTH);
const SPELLINGS = z.array(NAME).max(LINE_FINDER_LIMITS.SPELLINGS_MAX).default([]);
const HANDLE = z.string().trim().max(LINE_FINDER_LIMITS.HANDLE_MAX_LENGTH);
const VIDEO_ID = z.string().trim().min(1).max(20);
const PERSON_ID = z.string().trim().length(24);

// ─── Backend routes ──────────────────────────────────────────────────────────

export const LINE_FINDER_DISCOVER_REQUEST_SCHEMA = z.object({
  name: NAME,
  spellings: SPELLINGS,
  handle: HANDLE.nullish(),
});

export const LINE_FINDER_CAPTIONS_REQUEST_SCHEMA = z.object({ videoId: VIDEO_ID });

export const LINE_FINDER_CHECK_SPEAKER_REQUEST_SCHEMA = z.object({
  person: NAME,
  title: z.string().nullable(),
  channelName: z.string().nullable(),
  context: z.string().min(1).max(LINE_FINDER_LIMITS.SPEAKER_CONTEXT_MAX_LENGTH),
});

// ─── Server actions ──────────────────────────────────────────────────────────

export const LINE_FINDER_SEARCH_REQUEST_SCHEMA = z.object({
  personId: PERSON_ID,
  line: z.string().trim().min(1).max(LINE_FINDER_LIMITS.LINE_MAX_LENGTH),
});

export const LINE_FINDER_ADD_PERSON_REQUEST_SCHEMA = z.object({
  name: NAME,
  spellings: SPELLINGS,
  handle: HANDLE.optional(),
});

export const LINE_FINDER_MARK_REQUEST_SCHEMA = z.object({
  personId: PERSON_ID,
  videoId: VIDEO_ID,
  startMs: z.number().int().min(0),
  label: z.enum([LINE_FINDER_SPEAKER.CONFIRMED, LINE_FINDER_SPEAKER.SOMEONE_ELSE]),
});
