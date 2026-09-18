import { createMediaHandler } from "../create-handler";
import { MEDIA_EFFECTS_REQUEST_SCHEMA } from "./schemas";
import { applyEffects } from "./effects";

/** POST /media/effects — a clip in, a graded copy out, or a preset preview sheet. */
export const mediaEffectsHandler = createMediaHandler({
  label: "MEDIA/EFFECTS",
  schema: MEDIA_EFFECTS_REQUEST_SCHEMA,
  fetch: (input) => applyEffects(input),
});
