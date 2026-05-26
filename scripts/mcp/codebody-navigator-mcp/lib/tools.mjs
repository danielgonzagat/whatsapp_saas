// Tool registry — declares every public MCP tool of the CodeBody Navigator,
// alongside its handler. Each handler returns a JSON-serialisable object.

import { join } from 'node:path';
import { createSessionStore } from './session.mjs';
import { createCodegraphAdapter } from './codegraph-adapter.mjs';
import { createFilesystemAdapter } from './filesystem-adapter.mjs';
import { createNestJsScanner } from './nestjs-scanner.mjs';
import { createPrismaScanner } from './prisma-scanner.mjs';
import { createReactScanner } from './react-scanner.mjs';
import { createRouteTracer } from './route-tracer.mjs';
import { createGapDetector } from './gap-detector.mjs';
import { createProofEngine } from './proof-engine.mjs';
import { createCapabilityExplorer } from './capability-explorer.mjs';
import { listDomains, findDomain } from './kloel-domain-map.mjs';

export function createNavigator({ workspaceRoot, stateDir }) {
  const sessions = createSessionStore(stateDir);
  const codegraph = createCodegraphAdapter({ workspaceRoot });
  const fs = createFilesystemAdapter({ workspaceRoot });
  const nestjs = createNestJsScanner({ workspaceRoot });
  const prisma = createPrismaScanner({ workspaceRoot });
  const react = createReactScanner({ workspaceRoot });
  const tracer = createRouteTracer({ workspaceRoot, codegraph, nestjs, react, prisma });
  const gaps = createGapDetector({ workspaceRoot, codegraph, nestjs, react, prisma, tracer });
  const proof = createProofEngine({ workspaceRoot, codegraph, prisma, tracer });
  const capabilityExplorer = createCapabilityExplorer({ workspaceRoot, codegraph, nestjs, react, prisma, tracer, gaps });

  // ─── L1 — body / session primitives ────────────────────────────────────────
  function navStartSession({ goal, label } = {}) {
    const session = sessions.startSession({ workspaceRoot, goal, label });
    return { session, codegraph: codegraph.status() };
  }

  function navWhereAmI() {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session — call nav_start_session' };
    return {
      ok: true,
      sessionId: s.id,
      goal: s.goal,
      currentNode: s.currentNode,
      currentFile: s.currentFile,
      currentSymbol: s.currentSymbol,
      breadcrumbDepth: s.breadcrumbs.length,
      stats: s.stats,
      frontierCount: s.frontier.length,
      hypothesisCount: s.hypotheses.length,
      receiptCount: s.receipts.length,
    };
  }

  function navMoveToFile({ filePath, line, reason }) {
    if (!filePath) throw new Error('filePath required');
    const fileNode = codegraph.resolveFileNode(filePath);
    const located = sessions.setLocation({
      kind: 'file',
      name: filePath.split('/').pop(),
      filePath,
      line: line || null,
      qualifiedName: filePath,
      nodeId: fileNode.ok ? (fileNode.node?.id ?? null) : null,
      reason,
    });
    const slice = fs.readWindowAround(filePath, line || 1, { radius: 15, maxLines: 60 });
    return { ...located, preview: slice.ok ? slice : { ok: false, error: slice.error } };
  }

  function navMoveToSymbol({ symbol, qualifiedName, reason }) {
    if (!symbol && !qualifiedName) throw new Error('symbol or qualifiedName required');
    let target = null;
    if (qualifiedName) {
      const r = codegraph.findByQualifiedName(qualifiedName);
      if (r.ok && r.node) target = r.node;
    }
    if (!target && symbol) {
      const r = codegraph.resolveSymbol(symbol);
      if (r.ok && r.candidates.length) target = r.candidates[0];
    }
    if (!target) return { ok: false, error: `symbol not found: ${symbol || qualifiedName}` };
    const located = sessions.setLocation({
      kind: target.kind,
      name: target.name,
      filePath: target.file_path,
      line: target.start_line,
      qualifiedName: target.qualified_name,
      nodeId: target.id,
      reason,
    });
    const slice = fs.readWindowAround(target.file_path, target.start_line, { radius: 20, maxLines: 80 });
    return { ok: true, ...located, target, preview: slice.ok ? slice : null };
  }

  function navBack() {
    return sessions.pop();
  }

  function navBreadcrumbs({ limit = 20 } = {}) {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    return { ok: true, breadcrumbs: s.breadcrumbs.slice(-limit) };
  }

  function navListSessions() {
    return { ok: true, sessions: sessions.listSessions() };
  }

  function navSwitchSession({ id }) {
    return { ok: true, session: sessions.switchSession(id) };
  }

  function navReadHere({ radius = 25, maxLines = 200 } = {}) {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    if (!s.currentFile) return { ok: false, error: 'no current file' };
    return fs.readWindowAround(s.currentFile, s.currentNode?.line || 1, { radius, maxLines });
  }

  // ─── L2 — semantic movement ───────────────────────────────────────────────
  function navJumpToDefinition({ symbol, qualifiedName }) {
    const r = navMoveToSymbol({ symbol, qualifiedName, reason: 'jump_to_definition' });
    sessions.bumpStat('jumps');
    return r;
  }

  function navFindReferences({ symbol, qualifiedName, limit = 30 }) {
    let nodeId = null;
    if (qualifiedName) {
      const r = codegraph.findByQualifiedName(qualifiedName);
      if (r.ok && r.node) nodeId = r.node.id;
    }
    if (!nodeId && symbol) {
      const r = codegraph.resolveSymbol(symbol);
      if (r.ok && r.candidates.length) nodeId = r.candidates[0].id;
    }
    if (!nodeId) return { ok: false, error: `symbol not found: ${symbol || qualifiedName}` };
    const ins = codegraph.incoming(nodeId, { kind: 'calls', limit });
    return { ok: true, references: (ins.edges || []).map((e) => ({ file: e.file_path, line: e.line, name: e.name, kind: e.kind, qualifiedName: e.qualified_name })) };
  }

  function navFollowCall({ symbol, qualifiedName, depth = 1, limit = 30 }) {
    let nodeId = null;
    if (qualifiedName) {
      const r = codegraph.findByQualifiedName(qualifiedName);
      if (r.ok && r.node) nodeId = r.node.id;
    }
    if (!nodeId && symbol) {
      const r = codegraph.resolveSymbol(symbol);
      if (r.ok && r.candidates.length) nodeId = r.candidates[0].id;
    }
    if (!nodeId) return { ok: false, error: `symbol not found: ${symbol || qualifiedName}` };
    const t = codegraph.transitiveCallees(nodeId, { depth, cap: limit });
    return { ok: true, callees: (t.callees || []).map((c) => ({ depth: c.depth, name: c.node.name, file: c.node.file_path, line: c.node.start_line, kind: c.node.kind })) };
  }

  function navFollowImport({ filePath, importName }) {
    if (!filePath) throw new Error('filePath required');
    const fileNode = codegraph.resolveFileNode(filePath);
    if (!fileNode.ok || !fileNode.node) return { ok: false, error: 'file node not found' };
    const out = codegraph.outgoing(fileNode.node.id, { kind: 'imports', limit: 80 });
    let edges = out.edges || [];
    if (importName) edges = edges.filter((e) => (e.name || '').includes(importName));
    return { ok: true, imports: edges.map((e) => ({ name: e.name, file: e.file_path, line: e.line, kind: e.kind })) };
  }

  function navNeighbors({ hops = 1, limitPerHop = 60 } = {}) {
    const s = sessions.snapshot();
    if (!s?.currentNode?.nodeId) return { ok: false, error: 'no current node id — move to a symbol first' };
    return codegraph.neighborhood(s.currentNode.nodeId, { hops, limitPerHop });
  }

  // ─── L3 — route tracing ───────────────────────────────────────────────────
  function navTraceEndpoint({ method, path }) {
    sessions.bumpStat('traces');
    const r = tracer.traceEndpoint(method || 'GET', path);
    if (r.ok && r.matches[0]) {
      sessions.addRoute({ kind: 'endpoint', method: r.method, path, hits: r.matches.length });
    }
    return r;
  }

  function navTraceChatAction({ message }) {
    sessions.bumpStat('traces');
    const r = tracer.traceChatAction(message);
    sessions.addRoute({ kind: 'chat_action', message, intents: r.intentsRecognized, chains: r.callChains.length });
    return r;
  }

  function navTraceDomain({ domain }) {
    sessions.bumpStat('traces');
    const r = tracer.traceDomain(domain);
    if (r.ok) sessions.addRoute({ kind: 'domain', domain: r.domain.key });
    return r;
  }

  function navTracePrismaModel({ model }) {
    return tracer.tracePrismaModel(model);
  }

  function navTraceTool({ tool }) {
    return tracer.traceTool(tool);
  }

  function navTraceEvent({ event }) {
    return tracer.traceEvent(event);
  }

  function navListDomains() {
    return { ok: true, domains: listDomains() };
  }

  function navListRoutes() {
    return { ok: true, routes: react.listRoutes().routes, apiProxies: react.listApiProxies().proxies };
  }

  function navListEndpoints({ method } = {}) {
    return nestjs.listEndpoints({ method });
  }

  function navListPrismaModels() {
    return prisma.listModels();
  }

  // ─── L4 — frontier / emergence ────────────────────────────────────────────
  function navDetectGaps({ domain }) {
    sessions.bumpStat('gaps');
    const r = gaps.summarizeDomain(domain);
    if (r.ok) {
      const fr = sessions.addFrontier({
        kind: 'domain_gap',
        domain: r.domain.key,
        reason: `${r.gaps.modelsWritingWithoutEvents.length} writes w/o events; ${r.gaps.modelsWritingWithoutReceipts.length} writes w/o receipts`,
        risk: 'medium',
      });
      return { ...r, frontier: fr };
    }
    return r;
  }

  function navAddFrontier({ kind, reason, risk = 'medium', target }) {
    return sessions.addFrontier({ kind, reason, risk, target });
  }

  function navRemoveFrontier({ id }) {
    return { removed: sessions.removeFrontier(id) };
  }

  function navListFrontier() {
    const s = sessions.snapshot();
    return { ok: true, frontier: s?.frontier || [], blocked: s?.blocked || [] };
  }

  function navNextBestProbe() {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    const ranked = [...(s.frontier || [])].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.risk] ?? 1) - (order[b.risk] ?? 1) || a.at.localeCompare(b.at);
    });
    if (!ranked.length) return { ok: true, probe: null, note: 'frontier empty — call nav_detect_gaps for each domain' };
    return { ok: true, probe: ranked[0] };
  }

  function navFindOrphanModules() {
    return gaps.detectOrphanModules();
  }

  function navFindDeadTools() {
    return gaps.detectDeadTools();
  }

  function navFindStubRoutes(args = {}) {
    return gaps.detectStubRoutes(args);
  }

  function navFindHardcodedReality(args = {}) {
    return gaps.detectHardcodedReality(args);
  }

  function navFindDeadHandlers(args = {}) {
    return gaps.detectDeadHandlers(args);
  }

  function navFindDeadApiCalls(args = {}) {
    return gaps.detectDeadApiCalls(args);
  }

  // ─── L5 — proof / receipts ────────────────────────────────────────────────
  function navPlanChatToEffect({ message, expectModel, expectEvent }) {
    const plan = proof.planChatToEffect({ message, expectModel, expectEvent });
    if (plan.ok) {
      sessions.addReceipt({
        kind: 'chat_to_effect',
        message,
        expectModel,
        expectEvent,
        assertions: plan.plan.assertions,
      });
    }
    return plan;
  }

  function navVerifyReceipt({ receiptId, observed }) {
    const s = sessions.snapshot();
    if (!s) return { ok: false, error: 'no active session' };
    const receipt = s.receipts.find((r) => r.id === receiptId);
    if (!receipt) return { ok: false, error: `receipt not found: ${receiptId}` };
    return proof.verifyReceipt(receipt, observed || {});
  }

  function navListReceipts() {
    const s = sessions.snapshot();
    return { ok: true, receipts: s?.receipts || [] };
  }

  function navAddHypothesis({ statement, expectation, supports = [], contradicts = [] }) {
    return sessions.addHypothesis({ statement, expectation, supports, contradicts });
  }

  function navUpdateHypothesis({ id, status, evidence }) {
    return sessions.updateHypothesis(id, { status, evidence });
  }

  function navAddSurprise({ statement, observed, expected, severity }) {
    return sessions.addSurprise({ statement, observed, expected, severity });
  }

  function navListLedger() {
    const s = sessions.snapshot();
    return {
      ok: true,
      hypotheses: s?.hypotheses || [],
      surprises: s?.surprises || [],
      receipts: s?.receipts || [],
      routes: s?.routes || [],
    };
  }

  // ─── L6 — capability gap exploration ──────────────────────────────────────
  function navExploreCapabilityGap({ domain, capability }) {
    sessions.bumpStat('gaps');
    return capabilityExplorer.explore({ domain, capability });
  }

  function navAuditOrganism() {
    const out = gaps.detectCapabilityGaps();
    return out;
  }

  // ─── meta ─────────────────────────────────────────────────────────────────
  function navHealth() {
    return {
      ok: true,
      workspaceRoot,
      codegraph: codegraph.status(),
      sessions: sessions.listSessions().length,
    };
  }

  function navCodegraphContext({ task, maxNodes, maxCode }) {
    return codegraph.context(task, { maxNodes, maxCode });
  }

  function navCodegraphQuery({ query, limit, kind }) {
    return codegraph.query(query, { limit, kind });
  }

  return {
    // L1
    nav_start_session: navStartSession,
    nav_where_am_i: navWhereAmI,
    nav_move_to_file: navMoveToFile,
    nav_move_to_symbol: navMoveToSymbol,
    nav_back: navBack,
    nav_breadcrumbs: navBreadcrumbs,
    nav_list_sessions: navListSessions,
    nav_switch_session: navSwitchSession,
    nav_read_here: navReadHere,
    // L2
    nav_jump_to_definition: navJumpToDefinition,
    nav_find_references: navFindReferences,
    nav_follow_call: navFollowCall,
    nav_follow_import: navFollowImport,
    nav_neighbors: navNeighbors,
    // L3
    nav_trace_endpoint: navTraceEndpoint,
    nav_trace_chat_action: navTraceChatAction,
    nav_trace_domain: navTraceDomain,
    nav_trace_prisma_model: navTracePrismaModel,
    nav_trace_tool: navTraceTool,
    nav_trace_event: navTraceEvent,
    nav_list_domains: navListDomains,
    nav_list_routes: navListRoutes,
    nav_list_endpoints: navListEndpoints,
    nav_list_prisma_models: navListPrismaModels,
    // L4
    nav_detect_gaps: navDetectGaps,
    nav_add_frontier: navAddFrontier,
    nav_remove_frontier: navRemoveFrontier,
    nav_list_frontier: navListFrontier,
    nav_next_best_probe: navNextBestProbe,
    nav_find_orphan_modules: navFindOrphanModules,
    nav_find_dead_tools: navFindDeadTools,
    nav_find_stub_routes: navFindStubRoutes,
    nav_find_hardcoded_reality: navFindHardcodedReality,
    nav_find_dead_handlers: navFindDeadHandlers,
    nav_find_dead_api_calls: navFindDeadApiCalls,
    // L5
    nav_plan_chat_to_effect: navPlanChatToEffect,
    nav_verify_receipt: navVerifyReceipt,
    nav_list_receipts: navListReceipts,
    nav_add_hypothesis: navAddHypothesis,
    nav_update_hypothesis: navUpdateHypothesis,
    nav_add_surprise: navAddSurprise,
    nav_list_ledger: navListLedger,
    // L6
    nav_explore_capability_gap: navExploreCapabilityGap,
    nav_audit_organism: navAuditOrganism,
    // meta
    nav_health: navHealth,
    nav_codegraph_context: navCodegraphContext,
    nav_codegraph_query: navCodegraphQuery,
  };
}

// Tool catalogue (name + description + JSON Schema). Kept verbose so that
// model-side discovery surfaces the *intent* of each tool clearly.
export const TOOL_CATALOGUE = [
  // L1 — body
  { name: 'nav_start_session', description: 'Start a new navigation session for this workspace. The session has a persistent "body" (current node, breadcrumbs, visited set, frontier, hypotheses, surprises, receipts, routes). Use this BEFORE any other nav_* call.', inputSchema: { type: 'object', properties: { goal: { type: 'string', description: 'Plain-language goal of the session (e.g. "trace where chat creates products").' }, label: { type: 'string', description: 'Optional short label.' } } } },
  { name: 'nav_where_am_i', description: 'Return the current position (file, line, symbol, qualifiedName), breadcrumb depth, frontier and ledger counts.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_move_to_file', description: 'Move the navigator body to a file (optionally a specific line). Pushes a breadcrumb step and returns a windowed preview of the file around that line.', inputSchema: { type: 'object', properties: { filePath: { type: 'string' }, line: { type: 'number' }, reason: { type: 'string' } }, required: ['filePath'] } },
  { name: 'nav_move_to_symbol', description: 'Move the navigator body to a symbol resolved through CodeGraph (method, function, class, interface). Accepts either a bare name or a fully qualified name.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, qualifiedName: { type: 'string' }, reason: { type: 'string' } } } },
  { name: 'nav_back', description: 'Pop the last breadcrumb step and restore the previous current node.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_breadcrumbs', description: 'Return the last N breadcrumb steps (default 20).', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'nav_list_sessions', description: 'List all known navigation sessions for this workspace.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_switch_session', description: 'Make a different session the active one.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'nav_read_here', description: 'Read a window of source around the current position (default ±25 lines).', inputSchema: { type: 'object', properties: { radius: { type: 'number' }, maxLines: { type: 'number' } } } },
  // L2 — semantic
  { name: 'nav_jump_to_definition', description: 'Move to the definition of a symbol (LSP-style). Counts as a "jump" in session stats.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, qualifiedName: { type: 'string' } } } },
  { name: 'nav_find_references', description: 'Find call-sites that reference a symbol (using CodeGraph "calls" edges in the incoming direction).', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, qualifiedName: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'nav_follow_call', description: 'Follow calls outgoing from a symbol up to N hops deep (transitive callees, capped).', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, qualifiedName: { type: 'string' }, depth: { type: 'number' }, limit: { type: 'number' } } } },
  { name: 'nav_follow_import', description: 'Inspect a file\'s outgoing imports (optionally filtered by importName).', inputSchema: { type: 'object', properties: { filePath: { type: 'string' }, importName: { type: 'string' } }, required: ['filePath'] } },
  { name: 'nav_neighbors', description: 'Return the 1- or 2-hop neighborhood of the current node across all edge kinds (calls/contains/imports).', inputSchema: { type: 'object', properties: { hops: { type: 'number' }, limitPerHop: { type: 'number' } } } },
  // L3 — Kloel route tracing
  { name: 'nav_trace_endpoint', description: 'Trace a NestJS HTTP endpoint (METHOD /path) to its controller handler and transitive callees. Adds a route entry to the session ledger.', inputSchema: { type: 'object', properties: { method: { type: 'string' }, path: { type: 'string' } }, required: ['path'] } },
  { name: 'nav_trace_chat_action', description: 'Trace a Kloel chat utterance through intent detection → tool dispatcher → service → prisma. Returns recognized intents, tool definitions, and resolved call chains.', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'nav_trace_domain', description: 'Trace one of the configured Kloel "organs" (produtos, checkout, wallet, whatsapp, autopilot, …) into UI surfaces, backend handlers, Prisma models, and events.', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },
  { name: 'nav_trace_prisma_model', description: 'For a Prisma model, find every read site and every write site across backend+worker.', inputSchema: { type: 'object', properties: { model: { type: 'string' } }, required: ['model'] } },
  { name: 'nav_trace_tool', description: 'Trace a chat tool by its registered name (e.g. "save_product") through its dispatcher case → implementation → callees.', inputSchema: { type: 'object', properties: { tool: { type: 'string' } }, required: ['tool'] } },
  { name: 'nav_trace_event', description: 'Find emit sites and @OnEvent listeners for a given event name.', inputSchema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] } },
  { name: 'nav_list_domains', description: 'List all configured Kloel organs/domains with their globs and Prisma models.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_list_routes', description: 'List all Next.js app/pages router routes + /api proxy routes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_list_endpoints', description: 'List all NestJS endpoints (optionally filtered by HTTP method).', inputSchema: { type: 'object', properties: { method: { type: 'string' } } } },
  { name: 'nav_list_prisma_models', description: 'List all Prisma models with field counts and relations.', inputSchema: { type: 'object', properties: {} } },
  // L4 — frontier
  { name: 'nav_detect_gaps', description: 'For a domain, summarise UI/backend/prisma/events coverage and the structural gaps (writes w/o events, writes w/o receipts). Adds a frontier item.', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },
  { name: 'nav_add_frontier', description: 'Record a fresh exploration frontier item in the active session.', inputSchema: { type: 'object', properties: { kind: { type: 'string' }, reason: { type: 'string' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] }, target: { type: 'object' } }, required: ['kind', 'reason'] } },
  { name: 'nav_remove_frontier', description: 'Remove a frontier item by id (once probed and resolved).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'nav_list_frontier', description: 'List active frontier and blocked items.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_next_best_probe', description: 'Pick the highest-priority frontier item to probe next.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_find_orphan_modules', description: 'Find @Module() files whose class name is never referenced by any other backend file.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_find_dead_tools', description: 'Find Kloel chat tools defined with a name but never matched in any dispatcher case statement.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_find_stub_routes', description: 'Find Next.js page files shorter than N lines (likely stub redirects).', inputSchema: { type: 'object', properties: { minLines: { type: 'number' }, maxFiles: { type: 'number' } } } },
  { name: 'nav_find_hardcoded_reality', description: 'Find Math.random(), localStorage, MOCK_DATA, TODO/FIXME hits in the frontend.', inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } }, maxHits: { type: 'number' } } } },
  { name: 'nav_find_dead_handlers', description: 'Find React onClick={...} handlers that are no-ops or console.log only.', inputSchema: { type: 'object', properties: { maxHits: { type: 'number' } } } },
  { name: 'nav_find_dead_api_calls', description: 'Find apiFetch() callers whose URL resolves to neither a Next.js API proxy nor a NestJS endpoint.', inputSchema: { type: 'object', properties: { maxHits: { type: 'number' } } } },
  // L5 — proof
  { name: 'nav_plan_chat_to_effect', description: 'Build a falsifiable proof plan for "if I send chat message X, expect Prisma model Y write and event Z". Returns assertions you can run.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, expectModel: { type: 'string' }, expectEvent: { type: 'string' } }, required: ['message'] } },
  { name: 'nav_verify_receipt', description: 'Given a receipt id and runtime "observed" evidence, compute pass/fail per assertion and a verdict.', inputSchema: { type: 'object', properties: { receiptId: { type: 'string' }, observed: { type: 'object' } }, required: ['receiptId'] } },
  { name: 'nav_list_receipts', description: 'List all receipts recorded in the active session.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_add_hypothesis', description: 'Record a hypothesis (claim + expected evidence). Use during exploration; flip to confirmed/refuted later.', inputSchema: { type: 'object', properties: { statement: { type: 'string' }, expectation: { type: 'string' }, supports: { type: 'array', items: { type: 'string' } }, contradicts: { type: 'array', items: { type: 'string' } } }, required: ['statement', 'expectation'] } },
  { name: 'nav_update_hypothesis', description: 'Update a hypothesis status (open|confirmed|refuted) and attach evidence.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'status'] } },
  { name: 'nav_add_surprise', description: 'Record a surprise (observed ≠ expected) so the navigator learns from divergences.', inputSchema: { type: 'object', properties: { statement: { type: 'string' }, observed: { type: 'string' }, expected: { type: 'string' }, severity: { type: 'string' } }, required: ['statement', 'observed', 'expected'] } },
  { name: 'nav_list_ledger', description: 'Return the full session ledger: hypotheses, surprises, receipts, routes.', inputSchema: { type: 'object', properties: {} } },
  // L6 — capability
  { name: 'nav_explore_capability_gap', description: 'Headline tool: for (domain, capability), synthesise what the UI allows, what backend supports, what the DB models, what chat tools cover, missing pieces, smallest next-edit recommendation, test prompt, and risk class. Use this BEFORE any feature work to know exactly where to start.', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, capability: { type: 'string' } }, required: ['domain', 'capability'] } },
  { name: 'nav_audit_organism', description: 'Sweep every configured domain and return a per-domain summary of coverage + gaps. Heavy but comprehensive.', inputSchema: { type: 'object', properties: {} } },
  // meta
  { name: 'nav_health', description: 'Return MCP health: workspace root, CodeGraph DB status, session count.', inputSchema: { type: 'object', properties: {} } },
  { name: 'nav_codegraph_context', description: 'Delegate to `codegraph context` and return a markdown context bundle for a task.', inputSchema: { type: 'object', properties: { task: { type: 'string' }, maxNodes: { type: 'number' }, maxCode: { type: 'number' } }, required: ['task'] } },
  { name: 'nav_codegraph_query', description: 'Delegate to `codegraph query` (FTS5 + ranking) for raw symbol search.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, kind: { type: 'string' } }, required: ['query'] } },
];
