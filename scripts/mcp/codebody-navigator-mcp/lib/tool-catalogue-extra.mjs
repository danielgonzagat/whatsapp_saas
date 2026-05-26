export const TOOL_CATALOGUE_EXTRA = [
  // L6 — capability
  {
    name: 'nav_explore_capability_gap',
    description:
      'Headline tool: for (domain, capability), synthesise what the UI allows, what backend supports, what the DB models, what chat tools cover, missing pieces, smallest next-edit recommendation, test prompt, and risk class. Use this BEFORE feature work to know exactly where to start.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' }, capability: { type: 'string' } },
      required: ['domain', 'capability'],
    },
  },
  {
    name: 'nav_audit_organism',
    description:
      'Sweep every configured domain and return a per-domain summary of coverage + gaps. Heavy but comprehensive.',
    inputSchema: { type: 'object', properties: {} },
  },
  // meta
  {
    name: 'nav_health',
    description: 'Return MCP health: workspace root, CodeGraph DB status, session count.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'nav_codegraph_context',
    description: 'Delegate to `codegraph context` and return a markdown context bundle for a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        maxNodes: { type: 'number' },
        maxCode: { type: 'number' },
      },
      required: ['task'],
    },
  },
  {
    name: 'nav_codegraph_query',
    description: 'Delegate to `codegraph query` (FTS5 + ranking) for raw symbol search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        kind: { type: 'string' },
      },
      required: ['query'],
    },
  },
];
