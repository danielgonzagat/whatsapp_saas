/**
 * kloel-atomic-edit — MCP server that adds the sub-line action space the
 * built-in coarse editors lack.
 *
 * Closes the "Line-Oriented Action Bottleneck" at exactly the layer the
 * thesis identifies as defective: the agent/CLI tool contract. The model is
 * unchanged; the SYSTEM's action space gains first-class atomic operators,
 * loaded in every session via .mcp.json.
 *
 * Every tool: structural validation BEFORE write, atomic write (no torn
 * files), repo-containment + governance-protection guard, and an
 * Expansion-Factor metric so the thesis becomes measurable in practice.
 *
 * Transport is stdio. NOTHING may be written to stdout except MCP protocol
 * frames; all diagnostics go to stderr.
 *
 * Implementation is split into sibling modules (server-helpers-*.ts +
 * server-tools-{a..h}.ts) so each stays below the architecture-guard line
 * budget. This file is the orchestrator: it creates the McpServer instance,
 * delegates tool registration to each `register*Tools(server)` module, and
 * wires up the stdio transport in `main()`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import type { AnySchema, ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import * as os from 'node:os';
import { installHotReloadingToolCallbacks, runSingleToolCallFromEnv } from './server-helpers-hot-reload.js';
import { log } from './server-helpers-io.js';
import { registerToolsA } from './server-tools-a.js';
import { registerToolsB } from './server-tools-b.js';
import { registerToolsC } from './server-tools-c.js';
import { registerToolsD } from './server-tools-d.js';
import { registerToolsE1 } from './server-tools-e1.js';
import { registerToolsE2 } from './server-tools-e2.js';
import { registerToolsF } from './server-tools-f.js';
import { registerToolsG } from './server-tools-g.js';
import { registerToolsH } from './server-tools-h.js';
import { registerToolsNative } from './server-tools-native.js';
import { registerToolsNativeIo } from './server-tools-native-io.js';
import { registerToolsLocate } from './server-tools-locate.js';
import { registerToolsExec } from './server-tools-exec.js';
import { registerToolsConverge } from './server-tools-converge.js';
import { registerToolsIntentConverge } from './server-tools-intent-converge.js';
import { registerToolsLens } from './server-tools-lens.js';
import { registerToolsSession } from './server-tools-session.js';
import { registerToolsPositiveBytes } from './server-tools-positive-bytes.js';
import { registerToolsY } from './server-tools-y.js';
import { registerToolsCodexConfig } from './server-tools-codex-config.js';
import { registerToolsGit } from './server-tools-git.js';
import { registerToolsSelf } from './server-tools-self.js';
import { registerToolsSelfEvolution } from './server-tools-self-evolution.js';
import { registerToolsDisproof } from './server-tools-disproof.js';
import { registerToolsChromeDevtools } from './server-tools-chrome-devtools.js';

type RegisteredToolForList = {
  title?: string;
  description?: string;
  inputSchema?: AnySchema | ZodRawShapeCompat;
  outputSchema?: AnySchema | ZodRawShapeCompat;
  annotations?: Tool['annotations'];
  _meta?: Tool['_meta'];
  execution?: unknown;
  enabled?: boolean;
};

const EMPTY_OBJECT_JSON_SCHEMA: Tool['inputSchema'] = { type: 'object', properties: {} };

const CODEX_UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema',
  '$defs',
  'definitions',
  'default',
  'format',
  'not',
  'const',
  'additionalProperties',
  'patternProperties',
  'propertyNames',
  'unevaluatedProperties',
  'dependentSchemas',
  'if',
  'then',
  'else',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isToolRegistry(value: unknown): value is Record<string, RegisteredToolForList> {
  return isPlainObject(value);
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonSchema);
  if (!isPlainObject(value)) return value;

  const schema: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (CODEX_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    schema[key] = sanitizeJsonSchema(nested);
  }
  return schema;
}

function toCodexObjectSchema(
  schema: AnySchema | ZodRawShapeCompat | undefined,
  pipeStrategy: 'input' | 'output',
): Tool['inputSchema'] {
  const objectSchema = normalizeObjectSchema(schema);
  if (!objectSchema) return EMPTY_OBJECT_JSON_SCHEMA;

  const jsonSchema = toJsonSchemaCompat(objectSchema, {
    strictUnions: true,
    pipeStrategy,
  });
  const sanitized = sanitizeJsonSchema(jsonSchema);
  if (!isPlainObject(sanitized) || sanitized.type !== 'object') {
    return EMPTY_OBJECT_JSON_SCHEMA;
  }
  return sanitized as Tool['inputSchema'];
}

function installCodexSafeToolList(serverInstance: McpServer): void {
  const registry = Object.getOwnPropertyDescriptor(serverInstance, '_registeredTools')?.value;
  if (!isToolRegistry(registry)) return;

  for (const tool of Object.values(registry)) {
    delete tool.execution;
  }

  serverInstance.server.setRequestHandler(ListToolsRequestSchema, (): ListToolsResult => ({
    tools: Object.entries(registry)
      .filter(([, tool]) => tool.enabled !== false)
      .map(([name, tool]) => {
        const toolDefinition: Tool = {
          name,
          title: tool.title,
          description: tool.description,
          inputSchema: toCodexObjectSchema(tool.inputSchema, 'input'),
        };

        if (tool.annotations) toolDefinition.annotations = tool.annotations;
        if (tool._meta) toolDefinition._meta = tool._meta;
        if (tool.outputSchema) {
          toolDefinition.outputSchema = toCodexObjectSchema(tool.outputSchema, 'output');
        }

        return toolDefinition;
      }),
  }));
}


const server = new McpServer({ name: 'kloel-atomic-edit', version: '4.0.0' });
const hotToolRegistry = installHotReloadingToolCallbacks(server, { log });

registerToolsA(server);
registerToolsB(server);
registerToolsC(server);
registerToolsD(server);
registerToolsE1(server);
registerToolsE2(server);
registerToolsF(server);
registerToolsG(server);
registerToolsH(server);
registerToolsNative(server);
registerToolsNativeIo(server);
registerToolsLocate(server);
registerToolsExec(server);
registerToolsConverge(server);
registerToolsIntentConverge(server);
registerToolsLens(server);
registerToolsSession(server);
registerToolsPositiveBytes(server);
registerToolsY(server);
registerToolsCodexConfig(server);
registerToolsGit(server);
registerToolsSelf(server);
registerToolsSelfEvolution(server);
registerToolsDisproof(server);
registerToolsChromeDevtools(server);
installCodexSafeToolList(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — repo=${process.cwd()} node=${process.version} pid=${process.pid}`);
  log(`tmpdir=${os.tmpdir()}`);
}

async function boot(): Promise<void> {
  if (await runSingleToolCallFromEnv(hotToolRegistry)) return;
  await main();
}

boot().catch((e) => {
  log('FATAL', e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
