import { createSegmentHandler } from "../create-handler";
import { BY_SPEECH_REQUEST_SCHEMA } from "./schemas";
import { rankBySpeech } from "./rank";

/** POST /segment/by_speech — diarized transcript + provider in, ranked clip candidates out. */
export const segmentBySpeechHandler = createSegmentHandler({
  label: "SEGMENT/BY_SPEECH",
  schema: BY_SPEECH_REQUEST_SCHEMA,
  fetch: (input) => rankBySpeech(input),
});
