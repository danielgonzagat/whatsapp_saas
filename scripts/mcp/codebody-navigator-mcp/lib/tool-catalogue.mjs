import { TOOL_CATALOGUE_EXTRA } from './tool-catalogue-extra.mjs';

// Tool catalogue (name + description + JSON Schema). Kept verbose so model-side
// discovery surfaces the intent of each tool clearly.
export const TOOL_CATALOGUE = [
  // L1 — body
  {
    name: 'nav_start_session',
    description:
      'Start a new navigation session for this workspace. The session has a persistent "body" (current node, breadcrumbs, visited set, frontier, hypotheses, surprises, receipts, routes). Use this BEFORE the next nav_* call.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description:
            'Plain-language goal of the session (e.g. "trace where chat creates products").',
        },
        label: { type: 'string', description: 'Optional short label.' },
      },
    },
  },
  {
    name: 'nav_where_am_i',
    description:
      'Return the current position (file, line, symbol, qualifiedName), breadcrumb depth, frontier and ledger counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_move_to_file',
    description:
      'Move the navigator body to a file (optionally a specific line). Pushes a breadcrumb step and returns a windowed preview of the file around that line.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        line: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'nav_move_to_symbol',
    description:
      'Move the navigator body to a symbol resolved through CodeGraph (method, function, class, interface). Accepts either a bare name or a fully qualified name.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        qualifiedName: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'nav_back',
    description: 'Pop the last breadcrumb step and restore the previous current node.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_breadcrumbs',
    description: 'Return the last N breadcrumb steps (default 20).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'nav_list_sessions',
    description: 'List all known navigation sessions for this workspace.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_switch_session',
    description: 'Make a different session the active one.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'nav_read_here',
    description: 'Read a window of source around the current position (default ±25 lines).',
    inputSchema: {
      type: 'object',
      properties: { radius: { type: 'number' }, maxLines: { type: 'number' } },
    },
  },
  // L2 — semantic
  {
    name: 'nav_jump_to_definition',
    description:
      'Move to the definition of a symbol (LSP-style). Counts as a "jump" in session stats.',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string' }, qualifiedName: { type: 'string' } },
    },
  },
  {
    name: 'nav_find_references',
    description:
      'Find call-sites that reference a symbol (using CodeGraph "calls" edges in the incoming direction).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        qualifiedName: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'nav_follow_call',
    description:
      'Follow calls outgoing from a symbol up to N hops deep (transitive callees, capped).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        qualifiedName: { type: 'string' },
        depth: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'nav_follow_import',
    description: "Inspect a file's outgoing imports (optionally filtered by importName).",
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string' }, importName: { type: 'string' } },
      required: ['filePath'],
    },
  },
  {
    name: 'nav_neighbors',
    description:
      'Return the 1- or 2-hop neighborhood of the current node across all edge kinds (calls/contains/imports).',
    inputSchema: {
      type: 'object',
      properties: { hops: { type: 'number' }, limitPerHop: { type: 'number' } },
    },
  },
  // L3 — Kloel route tracing
  {
    name: 'nav_trace_endpoint',
    description:
      'Trace a NestJS HTTP endpoint (METHOD /path) to its controller handler and transitive callees. Adds a route entry to the session ledger.',
    inputSchema: {
      type: 'object',
      properties: { method: { type: 'string' }, path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'nav_trace_chat_action',
    description:
      'Trace a Kloel chat utterance through intent detection → tool dispatcher → service → prisma. Returns recognized intents, tool definitions, and resolved call chains.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'nav_trace_domain',
    description:
      'Trace one of the configured Kloel "organs" (produtos, checkout, wallet, whatsapp, autopilot, …) into UI surfaces, backend handlers, Prisma models, and events.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'nav_trace_prisma_model',
    description:
      'For a Prisma model, find every read site and every write site across backend+worker.',
    inputSchema: { type: 'object', properties: { model: { type: 'string' } }, required: ['model'] },
  },
  {
    name: 'nav_trace_tool',
    description:
      'Trace a chat tool by its registered name (e.g. "save_product") through its dispatcher case → implementation → callees.',
    inputSchema: { type: 'object', properties: { tool: { type: 'string' } }, required: ['tool'] },
  },
  {
    name: 'nav_trace_event',
    description: 'Find emit sites and @OnEvent listeners for a given event name.',
    inputSchema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] },
  },
  {
    name: 'nav_list_domains',
    description: 'List all configured Kloel organs/domains with their globs and Prisma models.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_list_routes',
    description: 'List all Next.js app/pages router routes + /api proxy routes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_list_endpoints',
    description: 'List all NestJS endpoints (optionally filtered by HTTP method).',
    inputSchema: { type: 'object', properties: { method: { type: 'string' } } },
  },
  {
    name: 'nav_list_prisma_models',
    description: 'List all Prisma models with field counts and relations.',
    inputSchema: { type: 'object', properties: {} },
  },
  // L4 — frontier
  {
    name: 'nav_detect_gaps',
    description:
      'For a domain, summarise UI/backend/prisma/events coverage and the structural gaps (writes w/o events, writes w/o receipts). Adds a frontier item.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain'],
    },
  },
  {
    name: 'nav_add_frontier',
    description: 'Record a fresh exploration frontier item in the active session.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        reason: { type: 'string' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        target: { type: 'object' },
      },
      required: ['kind', 'reason'],
    },
  },
  {
    name: 'nav_remove_frontier',
    description: 'Remove a frontier item by id (once probed and resolved).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'nav_list_frontier',
    description: 'List active frontier and blocked items.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_next_best_probe',
    description: 'Pick the highest-priority frontier item to probe next.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_find_orphan_modules',
    description:
      'Find @Module() files whose class name is not referenced from another backend file.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_find_dead_tools',
    description:
      'Find Kloel chat tools defined with a name but missing from dispatcher case statements.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_find_stub_routes',
    description: 'Find Next.js page files shorter than N lines (likely stub redirects).',
    inputSchema: {
      type: 'object',
      properties: { minLines: { type: 'number' }, maxFiles: { type: 'number' } },
    },
  },
  {
    name: 'nav_find_hardcoded_reality',
    description: 'Find Math.random(), localStorage, MOCK_DATA, TODO/FIXME hits in the frontend.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        maxHits: { type: 'number' },
      },
    },
  },
  {
    name: 'nav_find_dead_handlers',
    description: 'Find React onClick={...} handlers that are no-ops or console.log only.',
    inputSchema: { type: 'object', properties: { maxHits: { type: 'number' } } },
  },
  {
    name: 'nav_find_dead_api_calls',
    description:
      'Find apiFetch() callers whose URL resolves to neither a Next.js API proxy nor a NestJS endpoint.',
    inputSchema: { type: 'object', properties: { maxHits: { type: 'number' } } },
  },
  // L5 — proof
  {
    name: 'nav_plan_chat_to_effect',
    description:
      'Build a falsifiable proof plan for "if I send chat message X, expect Prisma model Y write and event Z". Returns assertions you can run.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        expectModel: { type: 'string' },
        expectEvent: { type: 'string' },
      },
      required: ['message'],
    },
  },
  {
    name: 'nav_verify_receipt',
    description:
      'Given a receipt id and runtime "observed" evidence, compute pass/fail per assertion and a verdict.',
    inputSchema: {
      type: 'object',
      properties: { receiptId: { type: 'string' }, observed: { type: 'object' } },
      required: ['receiptId'],
    },
  },
  {
    name: 'nav_list_receipts',
    description: 'List all receipts recorded in the active session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_add_hypothesis',
    description:
      'Record a hypothesis (claim + expected evidence). Use during exploration; flip to confirmed/refuted later.',
    inputSchema: {
      type: 'object',
      properties: {
        statement: { type: 'string' },
        expectation: { type: 'string' },
        supports: { type: 'array', items: { type: 'string' } },
        contradicts: { type: 'array', items: { type: 'string' } },
      },
      required: ['statement', 'expectation'],
    },
  },
  {
    name: 'nav_update_hypothesis',
    description: 'Update a hypothesis status (open|confirmed|refuted) and attach evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        evidence: { type: 'string' },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'nav_add_surprise',
    description:
      'Record a surprise (observed ≠ expected) so the navigator learns from divergences.',
    inputSchema: {
      type: 'object',
      properties: {
        statement: { type: 'string' },
        observed: { type: 'string' },
        expected: { type: 'string' },
        severity: { type: 'string' },
      },
      required: ['statement', 'observed', 'expected'],
    },
  },
  {
    name: 'nav_list_ledger',
    description: 'Return the full session ledger: hypotheses, surprises, receipts, routes.',
    inputSchema: { type: 'object', properties: {} },
  },
  ...TOOL_CATALOGUE_EXTRA,
];
