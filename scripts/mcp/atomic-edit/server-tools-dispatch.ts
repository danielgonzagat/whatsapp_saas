import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { atomicRootFromModule, callFreshAtomicTool } from './server-helpers-hot-reload.js';
import { ok, fail } from './server-helpers-result.js';

export const ATOMIC_DISPATCH_TOOL_NAME = 'atomic_dispatch_tool';

function asToolArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function registerToolsDispatch(server: McpServer): void {
  server.registerTool(
    ATOMIC_DISPATCH_TOOL_NAME,
    {
      title: 'Stable Atomic dispatcher - invoke a fresh Atomic tool by name',
      description:
        'A stable no-restart escape hatch inside Atomic itself: call any tool present in the freshly compiled ' +
        'Atomic runtime by string name, even before the host client has rediscovered newly added tool names. ' +
        'The dispatch still goes through dist freshness, single-call MCP registration, and Atomic tool schemas; it ' +
        'cannot execute arbitrary commands and refuses recursive self-dispatch.',
      inputSchema: {
        toolName: z.string().min(1).describe('registered Atomic tool name to invoke in the freshly compiled runtime'),
        args: z.record(z.string(), z.unknown()).optional().describe('JSON object passed as the target Atomic tool arguments'),
      },
    },
    async (a) => {
      try {
        const toolName = a.toolName.trim();
        if (toolName.length === 0) return fail('toolName is required');
        if (toolName === ATOMIC_DISPATCH_TOOL_NAME) {
          return fail('atomic_dispatch_tool refuses self-dispatch to prevent recursive fresh-runtime spawning');
        }

        const freshResult = await callFreshAtomicTool(atomicRootFromModule(), process.env, toolName, asToolArgs(a.args));
        return ok({
          ok: true,
          dispatchedTool: toolName,
          freshResult,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
