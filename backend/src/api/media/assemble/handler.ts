import { createMediaHandler } from "../create-handler";
import { assembleRecap } from "./assemble";
import { MEDIA_ASSEMBLE_REQUEST_SCHEMA } from "./schemas";

/** POST /media/assemble — narrated sentences and their footage in, one finished recap out. */
export const mediaAssembleHandler = createMediaHandler({
  label: "MEDIA/ASSEMBLE",
  schema: MEDIA_ASSEMBLE_REQUEST_SCHEMA,
  fetch: (input) => assembleRecap(input),
});
