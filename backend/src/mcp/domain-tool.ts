import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok } from "./tool-result";
import { formatZodIssues, renderFieldLines, renderInputSignature, unwrapObject } from "./schema-signature";

export const MCP_LAYER = {
  RAW: "raw",
  INTEL: "intel",
} as const;

export type McpLayer = (typeof MCP_LAYER)[keyof typeof MCP_LAYER];

export type DomainLayerHandler = {
  schema: z.ZodTypeAny;
  run: (input: any) => Promise<unknown> | unknown;
};

export type DomainOp = {
  defaultLayer: McpLayer;
  raw?: DomainLayerHandler;
  intel?: DomainLayerHandler;
};

const LAYER_SCHEMA = z
  .enum([MCP_LAYER.RAW, MCP_LAYER.INTEL])
  .optional()
  .describe(
    'raw = HTTP scrape/compute. intel = computed overlay. Omit to use the op default (intel when that overlay exists, else raw). Invalid combo fails — no silent fallback.',
  );

function domainInputSchema(opKeys: [string, ...string[]]) {
  return z.object({
    op: z.enum(opKeys).describe("Which function to run in this domain."),
    layer: LAYER_SCHEMA,
    input: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        "Arguments for this op. Same shape as that op's HTTP POST body. Validated with the existing API Zod schema.",
      ),
  });
}

/**
 * How often a running tool call sends a keepalive. MCP clients drop a call whose
 * response stream stays silent too long — Hermes cuts at 300s regardless of its
 * configured tool timeout — so a long diarize, segment or claude call used to
 * fail even though the backend was still working. Any message on the stream
 * resets that clock; a debug log notification is the lightest one.
 */
const KEEPALIVE_INTERVAL_MS = 20_000;

function supportedLayers(op: DomainOp): McpLayer[] {
  const layers: McpLayer[] = [];
  if (op.raw) layers.push(MCP_LAYER.RAW);
  if (op.intel) layers.push(MCP_LAYER.INTEL);
  return layers;
}

export function registerDomainTool(
  server: McpServer,
  options: {
    name: string;
    description: string;
    ops: Record<string, DomainOp>;
  },
): void {
  const opKeys = Object.keys(options.ops);
  if (opKeys.length === 0) {
    throw new Error(`registerDomainTool(${options.name}): ops is empty`);
  }

  const inputSchema = domainInputSchema(opKeys as [string, ...string[]]);

  // Exact per-op input shapes, generated from the schemas each op validates
  // against, so an agent never has to guess field names, types or enums.
  // Field lines shared by 3+ ops (country, region, ...) are printed once.
  type Block = { label: string; lines: Array<[string, string]> | null; raw: string };
  const blocks: Block[] = [];
  for (const name of opKeys) {
    const op = options.ops[name];
    const layers = supportedLayers(op);
    const shared = layers.length === 2 && op.raw!.schema === op.intel!.schema;
    for (const layer of shared ? [layers[0]] : layers) {
      const schema = op[layer]!.schema;
      const label = layers.length > 1 && !shared ? `${name} [layer=${layer}]` : name;
      blocks.push({ label, lines: renderFieldLines(schema), raw: renderInputSignature(schema) });
    }
  }
  const counts = new Map<string, number>();
  for (const b of blocks) for (const [, l] of b.lines ?? []) counts.set(l, (counts.get(l) ?? 0) + 1);
  const common = [...counts].filter(([, n]) => n >= 3).map(([l]) => l);
  const commonSet = new Set(common);
  const signatures = blocks
    .map((b) => {
      if (!b.lines) return `  ${b.label}:\n${b.raw}`;
      if (b.lines.length === 0) return `  ${b.label}: (no input — omit it or pass {})`;
      const own = b.lines.filter(([, l]) => !commonSet.has(l)).map(([, l]) => `    ${l}`);
      const inherited = b.lines.filter(([, l]) => commonSet.has(l)).map(([k]) => k);
      const tail = inherited.length ? `    + shared: ${inherited.join(", ")}` : "";
      return [`  ${b.label}:`, ...own, tail].filter(Boolean).join("\n");
    })
    .join("\n");
  const sharedBlock = common.length
    ? `\nSHARED FIELDS (accepted wherever an op lists "+ shared"):\n${common.map((l) => `    ${l}`).join("\n")}`
    : "";
  const description = `${options.description.trim()}

INPUT SHAPES — authoritative, generated from the validators. Call as { op, layer?, input: {...} }. \`?\` = optional, \`= x\` = default, a|b = the only accepted values. Unknown fields are rejected, not ignored. On a validation error the message names the bad field and shows the expected shape: fix the arguments and call again.
${signatures}${sharedBlock}`;

  server.registerTool(
    options.name,
    {
      description,
      inputSchema,
    },
    async (args, extra) => {
      const startedAt = Date.now();
      const keepalive = setInterval(() => {
        extra
          .sendNotification({
            method: "notifications/message",
            params: {
              level: "debug",
              logger: "keepalive",
              data: `${options.name}.${String(args.op)} still running (${Math.round((Date.now() - startedAt) / 1000)}s)`,
            },
          })
          .catch(() => {});
      }, KEEPALIVE_INTERVAL_MS);
      try {
        const opName = String(args.op);
        const op = options.ops[opName];
        if (!op) throw new Error(`Unknown op "${opName}"`);

        const layer = (args.layer as McpLayer | undefined) ?? op.defaultLayer;
        const handler = op[layer];
        if (!handler) {
          throw new Error(
            `op=${opName} does not support layer=${layer}. Valid: ${supportedLayers(op).join(", ")}`,
          );
        }

        const input = (args.input ?? {}) as Record<string, unknown>;
        const shape = unwrapObject(handler.schema)?.shape;
        if (shape && input && typeof input === "object" && !Array.isArray(input)) {
          const unknown = Object.keys(input).filter((k) => !(k in shape));
          if (unknown.length) {
            throw new Error(
              `op=${opName}: unknown field(s) ${unknown.join(", ")}. Valid fields:\n${renderInputSignature(handler.schema)}`,
            );
          }
        }
        const result = handler.schema.safeParse(input);
        if (!result.success) {
          throw new Error(
            `op=${opName}: invalid input — ${formatZodIssues(result.error)}. Expected:\n${renderInputSignature(handler.schema)}`,
          );
        }
        const parsed = result.data;
        return ok(await handler.run(parsed));
      } catch (err) {
        return fail(err);
      } finally {
        clearInterval(keepalive);
      }
    },
  );
}
