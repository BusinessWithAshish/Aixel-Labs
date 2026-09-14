import { z } from "zod";

export const MEDIA_UPLOAD_INIT_REQUEST_SCHEMA = z.object({
  filename: z.string().min(1).describe("Original filename, including extension."),
  size: z.number().int().positive().describe("Total size of the file, in bytes."),
  mimeType: z.string().optional().describe("Optional MIME type of the file."),
});
