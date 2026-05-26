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
import { TOOL_CATALOGUE } from './tool-catalogue.mjs';
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
  function navExploreCapabilityGap({ domain, capability }) {
    sessions.bumpStat('gaps');
    return capabilityExplorer.explore({ domain, capability });
  }
  function navAuditOrganism() {
    const out = gaps.detectCapabilityGaps();
    return out;
  }
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
    nav_start_session: navStartSession,
    nav_where_am_i: navWhereAmI,
    nav_move_to_file: navMoveToFile,
    nav_move_to_symbol: navMoveToSymbol,
    nav_back: navBack,
    nav_breadcrumbs: navBreadcrumbs,
    nav_list_sessions: navListSessions,
    nav_switch_session: navSwitchSession,
    nav_read_here: navReadHere,
    nav_jump_to_definition: navJumpToDefinition,
    nav_find_references: navFindReferences,
    nav_follow_call: navFollowCall,
    nav_follow_import: navFollowImport,
    nav_neighbors: navNeighbors,
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
    nav_plan_chat_to_effect: navPlanChatToEffect,
    nav_verify_receipt: navVerifyReceipt,
    nav_list_receipts: navListReceipts,
    nav_add_hypothesis: navAddHypothesis,
    nav_update_hypothesis: navUpdateHypothesis,
    nav_add_surprise: navAddSurprise,
    nav_list_ledger: navListLedger,
    nav_explore_capability_gap: navExploreCapabilityGap,
    nav_audit_organism: navAuditOrganism,
    nav_health: navHealth,
    nav_codegraph_context: navCodegraphContext,
    nav_codegraph_query: navCodegraphQuery,
  };
}
