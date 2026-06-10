#!/usr/bin/env node
/**
 * atomic-swarm — sibling MCP server to atomic-edit, covering the surfaces the
 * native TUI has and the sealed atomic-edit admission window cannot grow yet:
 * governed web fetch/search, hash-verified skills, and parallel read-only job
 * fan-out through the atomic broker (no bypass).
 *
 * Every tool: fail-closed refusals, sha256 receipts, append-only ledger under
 * <repo>/.atomic/. See each module header for the per-surface doctrine.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { REPO_ROOT, redactSecrets } from './swarm-core.mjs';
import { swarmFetch } from './swarm-fetch.mjs';
import { swarmWebSearch } from './swarm-search.mjs';
import { skillList, skillLoad, skillRegister, skillVerify } from './swarm-skills.mjs';
import { brokerEndpoint, swarmExecBatch } from './swarm-batch.mjs';

const server = new McpServer({ name: 'atomic-swarm', version: '1.0.0' });

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function fail(error) {
  const message = redactSecrets(String(error?.message ?? error));
  const payload = { ok: false, error: message };
  if (error?.drift) payload.drift = error.drift;
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: true };
}

server.registerTool(
  'swarm_fetch',
  {
    title: 'Governed read-only web fetch with sha256 receipt',
    description:
      'Fetch an http(s) URL (GET/HEAD only, no credentials) and return the body with a verifiable receipt: final URL, status, content-type, byte count and sha256 of the exact body bytes, persisted to .atomic/swarm-fetch-ledger.jsonl. Binary bodies return as base64 instead of being corrupted through utf-8. Fail-closed policy refusals; capped body with explicit truncation flag.',
    inputSchema: {
      url: z.string().min(1),
      method: z.enum(['GET', 'HEAD']).optional(),
      headers: z.record(z.string()).optional(),
      maxBytes: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await swarmFetch(args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_web_search',
  {
    title: 'Web search with verifiable receipt',
    description:
      'Search the web (DuckDuckGo HTML endpoint, keyless) and return {title, url} results plus a receipt carrying the sha256 of the raw result page, so the result list can be re-derived from exact bytes. Never fabricates results: parse failure returns ok:false with the fetch receipt.',
    inputSchema: {
      query: z.string().min(1),
      maxResults: z.number().int().positive().max(25).optional(),
    },
  },
  async (args) => {
    try {
      return ok(await swarmWebSearch(args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_skill_register',
  {
    title: 'Register a skill tree with per-file sha256 + merkle root',
    description:
      'Walk a skill directory, hash every file (sha256) and persist a manifest with a merkle root under .atomic/skills/<name>.manifest.json. The manifest is the trust anchor for swarm_skill_load: later drift in any byte is a refusal.',
    inputSchema: {
      name: z.string().min(1),
      dir: z.string().min(1),
    },
  },
  async (args) => {
    try {
      return ok(skillRegister(args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_skill_load',
  {
    title: 'Load a skill file after re-verifying every registered hash',
    description:
      'Re-hash the registered skill tree and serve the requested file (default SKILL.md) ONLY if every byte still matches the manifest. Any drift (changed/missing/added file) is a fail-closed refusal with the exact delta — a drifted skill is treated as poisoned. The native TUI loads skills with zero verification.',
    inputSchema: {
      name: z.string().min(1),
      file: z.string().optional(),
    },
  },
  async (args) => {
    try {
      return ok(skillLoad(args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_skill_list',
  {
    title: 'List registered skills with live hash verification',
    description:
      'List every registered skill manifest with a live verification verdict (ok or the exact drift). Read-only.',
    inputSchema: {},
  },
  async () => {
    try {
      return ok(skillList());
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_skill_verify',
  {
    title: 'Verify one skill tree against its registered manifest',
    description:
      'Re-hash a registered skill tree and report ok or the exact per-file drift (changed/missing/added). Read-only, no content served.',
    inputSchema: {
      name: z.string().min(1),
    },
  },
  async (args) => {
    try {
      return ok(skillVerify(args.name));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_exec_batch',
  {
    title: 'Parallel read-only job fan-out through the atomic broker',
    description:
      'Run up to 64 read-only shell jobs in parallel (default 8 workers), each delegated to the SAME out-of-sandbox atomic broker that serves atomic_exec — fresh deny-by-default sandbox per command, no writes, no network, real exit codes. Fail-closed when no broker is reachable: the swarm never spawns unsandboxed shell. Per-job receipts (exit code, sha256 of stdout/stderr, duration) + aggregate ledger entry in .atomic/swarm-batch-ledger.jsonl.',
    inputSchema: {
      jobs: z
        .array(
          z.object({
            command: z.string().min(1),
            label: z.string().optional(),
            cwd: z.string().optional(),
          }),
        )
        .min(1)
        .max(64),
      maxParallel: z.number().int().positive().max(16).optional(),
      timeoutMs: z.number().int().positive().optional(),
      cwd: z.string().optional(),
    },
  },
  async (args) => {
    try {
      return ok(await swarmExecBatch(args));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'swarm_status',
  {
    title: 'Swarm surface status',
    description:
      'Report the swarm configuration: repo root, broker reachability (fail-closed indicator for swarm_exec_batch), ledger locations and registered skill count. Read-only.',
    inputSchema: {},
  },
  async () => {
    try {
      const skills = skillList();
      return ok({
        ok: true,
        repoRoot: REPO_ROOT,
        brokerEndpoint: brokerEndpoint(),
        ledgers: [
          '.atomic/swarm-fetch-ledger.jsonl',
          '.atomic/swarm-search-ledger.jsonl',
          '.atomic/swarm-skills-ledger.jsonl',
          '.atomic/swarm-batch-ledger.jsonl',
        ],
        skillCount: skills.skills.length,
      });
    } catch (error) {
      return fail(error);
    }
  },
);

async function runSingleToolCallFromEnv() {
  const toolName = process.env.SWARM_SINGLE_TOOL_NAME;
  if (!toolName) return false;
  let args = {};
  try {
    args = JSON.parse(process.env.SWARM_SINGLE_TOOL_ARGS || '{}');
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: 'bad SWARM_SINGLE_TOOL_ARGS json' }));
    process.exit(1);
  }
  const registry = Object.getOwnPropertyDescriptor(server, '_registeredTools')?.value;
  const tool = registry?.[toolName];
  if (!tool) {
    process.stdout.write(JSON.stringify({ ok: false, error: `unknown swarm tool: ${toolName}` }));
    process.exit(1);
  }
  const result = await tool.callback(args, {});
  process.stdout.write(JSON.stringify({ ok: result.isError !== true, result }));
  process.exit(result.isError === true ? 1 : 0);
}

const ranSingle = await runSingleToolCallFromEnv();
if (!ranSingle) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
