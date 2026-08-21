import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok } from "./tool-result";

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

  server.registerTool(
    options.name,
    {
      description: options.description,
      inputSchema,
    },
    async (args) => {
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

        const parsed = handler.schema.parse(args.input ?? {});
        return ok(await handler.run(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
