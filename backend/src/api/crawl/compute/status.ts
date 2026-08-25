import {
  CRAWL_PATTERNS,
  CRAWL_STATUS,
} from "../constants";
import type { CRAWL_STATUS_VALUE } from "../types";

export function classifyFetchError(err: unknown): CRAWL_STATUS_VALUE {
  const msg = err instanceof Error ? err.message : String(err);
  if (CRAWL_PATTERNS.DNS_FAIL.test(msg)) {
    return CRAWL_STATUS.DNS_FAIL;
  }
  if (CRAWL_PATTERNS.TIMEOUT.test(msg)) {
    return CRAWL_STATUS.TIMEOUT;
  }
  if (CRAWL_PATTERNS.BLOCKED.test(msg)) {
    return CRAWL_STATUS.BLOCKED;
  }
  return CRAWL_STATUS.UPSTREAM_ERROR;
}
