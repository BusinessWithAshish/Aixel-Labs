import { z } from "zod";
import { IG_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";
import type { IG_ADVANCED_POST_USER, IgMediaTypeLabel } from "../advanced/types";

export type IG_DOWNLOAD_REQUEST = z.input<typeof IG_DOWNLOAD_REQUEST_SCHEMA>;
export type IG_DOWNLOAD_REQUEST_PARSED = z.output<typeof IG_DOWNLOAD_REQUEST_SCHEMA>;

export type IgDownloadAssetKind = "video" | "image";

export type IG_DOWNLOAD_ITEM = {
  /** 0-based slide index (always 0 for single-media posts). */
  index: number;
  kind: IgDownloadAssetKind;
  filePath: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** True when the file was already on disk and nothing was fetched. */
  cached: boolean;
};

export type IG_DOWNLOAD_POST = {
  /** Echo of the requested URL / shortcode. */
  input: string;
  shortcode: string | null;
  ok: boolean;
  error?: string;
  url?: string;
  mediaTypeLabel?: IgMediaTypeLabel | "unknown";
  productType?: string | null;
  owner?: IG_ADVANCED_POST_USER | null;
  caption?: string | null;
  takenAt?: number | null;
  items: IG_DOWNLOAD_ITEM[];
};

export type IG_DOWNLOAD_RESPONSE = {
  posts: IG_DOWNLOAD_POST[];
  /** Bytes actually pulled from Instagram this call (SSR pages + media; cache hits excluded). */
  bytesFetched: number;
};
