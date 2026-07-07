import type { GSEARCH_CSE_JS_OPTIONS } from "../types";

/** Strip the `/*O_o*\/\n_(...)` JSONP wrapper and parse the inner JSON. */
export function parseJsonp(body: string): Record<string, unknown> {
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("CSE element: no JSON object in JSONP response");
  }
  return JSON.parse(body.slice(first, last + 1)) as Record<string, unknown>;
}

/** Parse the trailing `({...})` options blob from `cse.js`. */
export function parseCseJsToken(body: string): GSEARCH_CSE_JS_OPTIONS {
  const start = body.lastIndexOf("({");
  const end = body.lastIndexOf("});");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("cse.js: could not locate options blob");
  }
  return JSON.parse(body.slice(start + 1, end + 1)) as GSEARCH_CSE_JS_OPTIONS;
}
