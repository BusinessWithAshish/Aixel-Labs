import { z } from "zod";

/**
 * Compact, exact input signatures generated from the Zod schemas an op
 * validates against, appended to every domain tool's description so an agent
 * sees the real field names, types, allowed values and defaults instead of
 * guessing them. Generated, so it cannot drift from what the op accepts.
 */

const MAX_NOTE = 110;

function note(schema: z.ZodTypeAny): string {
  const d = schema.description?.trim();
  if (!d) return "";
  // First sentence, without splitting on "e.g." / "i.e." abbreviations.
  const first = d.split(/(?<!\b(?:e\.g|i\.e|etc|vs))\.\s+(?=[A-Z(])/)[0].replace(/\.$/, "");
  return first.length > MAX_NOTE ? `${first.slice(0, MAX_NOTE - 1)}…` : first;
}

function num(def: any): string {
  const parts: string[] = [];
  let isInt = false;
  for (const c of def.checks ?? []) {
    if (c.kind === "int") isInt = true;
    else if (c.kind === "min") parts.push(`${c.inclusive === false ? ">" : ">="}${c.value}`);
    else if (c.kind === "max") parts.push(`${c.inclusive === false ? "<" : "<="}${c.value}`);
  }
  return `${isInt ? "integer" : "number"}${parts.length ? ` ${parts.join(" ")}` : ""}`;
}

function str(def: any): string {
  const parts: string[] = [];
  for (const c of def.checks ?? []) {
    if (c.kind === "min" && c.value > 1) parts.push(`min ${c.value} chars`);
    else if (c.kind === "max") parts.push(`max ${c.value} chars`);
    else if (c.kind === "url") parts.push("URL");
  }
  return `string${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** Unwrap wrappers that do not change the accepted shape. */
export function unwrapObject(schema: z.ZodTypeAny): z.ZodObject<any> | null {
  let s: any = schema;
  for (let i = 0; i < 10 && s; i++) {
    const t = s._def?.typeName;
    if (t === "ZodObject") return s;
    if (t === "ZodEffects") s = s._def.schema;
    else if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault") s = s._def.innerType;
    else if (t === "ZodBranded" || t === "ZodReadonly" || t === "ZodCatch") s = s._def.type ?? s._def.innerType;
    else if (t === "ZodPipeline") s = s._def.in;
    else return null;
  }
  return null;
}

export function renderType(schema: z.ZodTypeAny, depth = 0): string {
  const def: any = (schema as any)._def;
  switch (def?.typeName) {
    case "ZodString": return str(def);
    case "ZodNumber": return num(def);
    case "ZodBoolean": return "boolean";
    case "ZodBigInt": return "integer";
    case "ZodDate": return "date";
    case "ZodLiteral": return JSON.stringify(def.value);
    case "ZodEnum": return (def.values as string[]).map((v) => JSON.stringify(v)).join("|");
    case "ZodNativeEnum": return Object.values(def.values).filter((v) => typeof v === "string").map((v) => JSON.stringify(v)).join("|");
    case "ZodOptional":
    case "ZodNullable": return renderType(def.innerType, depth);
    case "ZodDefault": return renderType(def.innerType, depth);
    case "ZodEffects": return renderType(def.schema, depth);
    case "ZodPipeline": return renderType(def.in, depth);
    case "ZodBranded": return renderType(def.type, depth);
    case "ZodLazy": return "object";
    case "ZodArray": {
      const min = def.minLength?.value, max = def.maxLength?.value;
      const bounds = min != null || max != null ? ` (${min ?? 0}-${max ?? "∞"} items)` : "";
      return `${renderType(def.type, depth + 1)}[]${bounds}`;
    }
    case "ZodTuple": return `[${def.items.map((i: any) => renderType(i, depth + 1)).join(", ")}]`;
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      const opts = (def.options instanceof Map ? [...def.options.values()] : def.options) as z.ZodTypeAny[];
      return opts.map((o) => renderType(o, depth + 1)).join(" | ");
    }
    case "ZodRecord": return `{[key: string]: ${renderType(def.valueType, depth + 1)}}`;
    case "ZodObject": return depth > 2 ? "object" : renderObject(schema as z.ZodObject<any>, depth + 1, true);
    case "ZodAny":
    case "ZodUnknown": return "any";
    default: return "any";
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return schema.isOptional();
}

function defaultOf(schema: z.ZodTypeAny): unknown {
  let s: any = schema;
  for (let i = 0; i < 6 && s; i++) {
    if (s._def?.typeName === "ZodDefault") return s._def.defaultValue();
    s = s._def?.innerType ?? s._def?.schema;
  }
  return undefined;
}

function renderObject(obj: z.ZodObject<any>, depth: number, inline: boolean): string {
  const fields = Object.entries(obj.shape as Record<string, z.ZodTypeAny>).map(([key, field]) => {
    const dflt = defaultOf(field);
    const optional = isOptional(field) || dflt !== undefined;
    const desc = inline ? "" : note(field);
    return `${key}${optional ? "?" : ""}: ${renderType(field, depth)}${dflt !== undefined ? ` = ${JSON.stringify(dflt)}` : ""}${desc ? ` — ${desc}` : ""}`;
  });
  if (inline) return `{${fields.join(", ")}}`;
  return fields.map((f) => `    ${f}`).join("\n");
}

/** One rendered line per field of an op's `input` object, keyed by field name. */
export function renderFieldLines(schema: z.ZodTypeAny): Array<[string, string]> | null {
  const obj = unwrapObject(schema);
  if (!obj) return null;
  return Object.keys(obj.shape).map((key) => {
    const one = z.object({ [key]: (obj.shape as Record<string, z.ZodTypeAny>)[key] });
    return [key, renderObject(one, 0, false).trim()];
  });
}

/** Multi-line signature of one op's `input` object. */
export function renderInputSignature(schema: z.ZodTypeAny): string {
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
