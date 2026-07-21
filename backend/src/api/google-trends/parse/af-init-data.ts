import { GOOGLE_TRENDS_AF_INIT } from "../constants";

/**
 * Extracts the `data:` payload of a single
 * `AF_initDataCallback({key:'<key>', ... data:<payload> ...})` block from the
 * trending-page HTML, returning the raw JSON string of `<payload>`.
 *
 * The block looks like:
 *   AF_initDataCallback({key: 'ds:0', hash: '2', data:[null,[["avengers doomsday",...]]], sideChannel: {}});
 *
 * We scan for the balanced `[...]` or `{...}` that follows `data:` so the
 * extraction is robust to nested arrays/objects and string-embedded brackets.
 *
 * Returns `null` when the key is not present in the HTML.
 */
export function extractAfInitData(html: string, key: string): string | null {
  const needle = `${GOOGLE_TRENDS_AF_INIT.KEY_PREFIX}${key}${GOOGLE_TRENDS_AF_INIT.KEY_SUFFIX}`;
  const keyIdx = html.indexOf(needle);
  if (keyIdx === -1) return null;

  const dataIdx = html.indexOf(GOOGLE_TRENDS_AF_INIT.DATA_MARKER, keyIdx);
  if (dataIdx === -1) return null;

  let i = dataIdx + GOOGLE_TRENDS_AF_INIT.DATA_MARKER.length;
  // Skip whitespace before the first structural character.
  while (i < html.length && /\s/.test(html[i])) i++;

  const open = html[i];
  if (open !== "[" && open !== "{") return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  const start = i;

  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }

  if (depth !== 0) return null;
  return html.slice(start, i);
}
