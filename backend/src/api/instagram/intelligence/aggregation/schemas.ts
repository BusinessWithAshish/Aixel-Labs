import { z } from "zod";

export const AGGREGATE_ACCOUNT_SIGNALS_SCHEMA = z.object({
  items: z
    .array(z.any())
    .describe(
      "The `posts` array from instagram_get_account_intelligence, all from the same account. Never mix posts from different accounts — follower counts differ too much for one outlier threshold to mean anything across them.",
    ),
  username: z
    .string()
    .optional()
    .describe("Label for this account — used for reference in the output only."),
});
