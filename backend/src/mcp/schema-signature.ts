import { z } from "zod";

/**
 * Compact, exact input signatures generated from the Zod schemas an op
 * validates against, appended to every domain tool's description so an agent
 * sees the real field names, types, allowed values and defaults instead of
 * guessing them. Generated, so it cannot drift from what the op accepts.
 */

const MAX_NOTE = 110;

/** The nearest description, looking through wrappers (zod 4 does not copy it onto `.optional()` / `.default()`). */
function descriptionOf(schema: z.ZodType): string | undefined {
  let s: any = schema;
  for (let i = 0; i < 10 && s; i++) {
    if (s.description) return s.description;
    const def = s._zod?.def;
    s = WRAPPERS.has(def?.type) ? def.innerType : def?.type === "pipe" ? pipeSide(def) : undefined;
  }
  return undefined;
}

function note(schema: z.ZodType): string {
  const d = descriptionOf(schema)?.trim();
  if (!d) return "";
  // First sentence, without splitting on "e.g." / "i.e." abbreviations.
  const first = d.split(/(?<!\b(?:e\.g|i\.e|etc|vs))\.\s+(?=[A-Z(])/)[0].replace(/\.$/, "");
  return first.length > MAX_NOTE ? `${first.slice(0, MAX_NOTE - 1)}…` : first;
}

/** A check's own definition (zod 4 keeps it under `_zod.def`). */
function checks(def: any): any[] {
  return (def.checks ?? []).map((c: any) => c._zod?.def ?? c);
}

const INT_FORMATS = new Set(["safeint", "int32", "uint32", "int64", "uint64"]);

function num(def: any): string {
  const parts: string[] = [];
  let isInt = INT_FORMATS.has(def.format);
  for (const c of checks(def)) {
    if (c.check === "number_format" && INT_FORMATS.has(c.format)) isInt = true;
    else if (c.check === "greater_than") parts.push(`${c.inclusive ? ">=" : ">"}${c.value}`);
    else if (c.check === "less_than") parts.push(`${c.inclusive ? "<=" : "<"}${c.value}`);
  }
  return `${isInt ? "integer" : "number"}${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

function str(def: any): string {
  const parts: string[] = [];
  if (def.format === "url") parts.push("URL");
  for (const c of checks(def)) {
    if (c.check === "min_length" && c.minimum > 1) parts.push(`min ${c.minimum} chars`);
    else if (c.check === "max_length") parts.push(`max ${c.maximum} chars`);
    else if (c.check === "string_format" && c.format === "url") parts.push("URL");
  }
  return `string${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** A pipe's input side, except for `z.preprocess` (a transform feeding the real schema). */
function pipeSide(def: any): any {
  return def.in?._zod?.def?.type === "transform" ? def.out : def.in;
}

const WRAPPERS = new Set(["optional", "nullable", "default", "prefault", "nonoptional", "readonly", "catch"]);

/** Unwrap wrappers that do not change the accepted shape. */
export function unwrapObject(schema: z.ZodType): z.ZodObject<any> | null {
  let s: any = schema;
  for (let i = 0; i < 10 && s; i++) {
    const def = s._zod?.def;
    if (def?.type === "object") return s;
    if (WRAPPERS.has(def?.type)) s = def.innerType;
    else if (def?.type === "pipe") s = pipeSide(def);
    else return null;
  }
  return null;
}

export function renderType(schema: z.ZodType, depth = 0): string {
  const def: any = (schema as any)._zod?.def;
  switch (def?.type) {
    case "string": return str(def);
    case "number": return num(def);
    case "boolean": return "boolean";
    case "bigint": return "integer";
    case "date": return "date";
    case "literal": return (def.values as unknown[]).map((v) => JSON.stringify(v)).join("|");
    case "enum": return Object.values(def.entries).filter((v) => typeof v === "string").map((v) => JSON.stringify(v)).join("|");
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "nonoptional":
    case "readonly":
    case "catch": return renderType(def.innerType, depth);
    case "pipe": return renderType(pipeSide(def), depth);
    case "lazy": return "object";
    case "array": {
      const cs = checks(def);
      const min = cs.find((c) => c.check === "min_length")?.minimum;
      const max = cs.find((c) => c.check === "max_length")?.maximum;
      const bounds = min != null || max != null ? ` (${min ?? 0}-${max ?? "∞"} items)` : "";
      return `${renderType(def.element, depth + 1)}[]${bounds}`;
    }
    case "tuple": return `[${def.items.map((i: any) => renderType(i, depth + 1)).join(", ")}]`;
    case "union": return (def.options as z.ZodType[]).map((o) => renderType(o, depth + 1)).join(" | ");
    case "record": return `{[key: string]: ${renderType(def.valueType, depth + 1)}}`;
    case "object": return depth > 2 ? "object" : renderObject(schema as z.ZodObject<any>, depth + 1, true);
    default: return "any";
  }
}

function isOptional(schema: z.ZodType): boolean {
  return schema.safeParse(undefined).success;
}

function defaultOf(schema: z.ZodType): unknown {
  let s: any = schema;
  for (let i = 0; i < 6 && s; i++) {
    const def = s._zod?.def;
    if (def?.type === "default") return def.defaultValue;
    s = def?.innerType ?? (def?.type === "pipe" ? pipeSide(def) : undefined);
  }
  return undefined;
}

function renderObject(obj: z.ZodObject<any>, depth: number, inline: boolean): string {
  const fields = Object.entries(obj.shape as Record<string, z.ZodType>).map(([key, field]) => {
    const dflt = defaultOf(field);
    const optional = isOptional(field) || dflt !== undefined;
    const desc = inline ? "" : note(field);
    return `${key}${optional ? "?" : ""}: ${renderType(field, depth)}${dflt !== undefined ? ` = ${JSON.stringify(dflt)}` : ""}${desc ? ` — ${desc}` : ""}`;
  });
  if (inline) return `{${fields.join(", ")}}`;
  return fields.map((f) => `    ${f}`).join("\n");
}

/** One rendered line per field of an op's `input` object, keyed by field name. */
export function renderFieldLines(schema: z.ZodType): Array<[string, string]> | null {
  const obj = unwrapObject(schema);
  if (!obj) return null;
  return Object.keys(obj.shape).map((key) => {
    const one = z.object({ [key]: (obj.shape as Record<string, z.ZodType>)[key] });
    return [key, renderObject(one, 0, false).trim()];
  });
}

/** Multi-line signature of one op's `input` object. */
export function renderInputSignature(schema: z.ZodType): string {
  const lines = renderFieldLines(schema);
  if (!lines) return `    ${renderType(schema)}`;
  if (lines.length === 0) return "    (no input — omit it or pass {})";
  return lines.map(([, l]) => `    ${l}`).join("\n");
}

/** Turn a ZodError into one readable line per problem. */
export function formatZodIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "(input)";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}
