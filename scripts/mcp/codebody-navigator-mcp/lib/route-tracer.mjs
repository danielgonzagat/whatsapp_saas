// Route tracer — given a starting point (a chat utterance, an endpoint, a
// tool name, a domain), traces the path through the layered organism:
//   UI surface → API proxy → backend controller → service → prisma model →
//   events → receipts. Returns a structured RouteTrace.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rg, rgFiles } from './ripgrep.mjs';
import { findDomain } from './kloel-domain-map.mjs';

function uniq(items, key = (x) => x) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export function createRouteTracer({ workspaceRoot, codegraph, nestjs, react, prisma }) {
  /** Search for chat-tool definitions matching a keyword (Kloel tool dispatcher). */
  function findChatToolDefinitions(keyword) {
    // Look for tool name keys and function names that mention the keyword.
    const patterns = [
      `name:\\s*['"\`]${keyword}['"\`]`,
      `case\\s+['"\`]${keyword}['"\`]`,
      `tool${keyword.replace(/[^A-Za-z0-9_]/g, '')}\\b`,
      `\\b${keyword}\\b`,
    ];
    const hits = [];
    for (const p of patterns) {
      const r = rg(p, { cwd: workspaceRoot, paths: ['backend/src/kloel'], globs: ['*.ts'], maxCount: 80 });
      for (const m of r.matches) hits.push({ file: m.file, line: m.line, text: m.text.trim(), pattern: p });
    }
    return uniq(hits, (h) => `${h.file}:${h.line}`).slice(0, 50);
  }

  /** Detect candidate intent → tool mapping. After real-use validation, the
   *  intent shape is not a single helper file with `intent: 'X'` literals —
   *  Kloel registers tools through `name: 'X'` blocks scattered across
   *  backend/src/kloel/**\/*.ts. We treat *every* such name as a candidate
   *  intent, filtered to verb-led multi-word names. */
  function findActionIntentHelpers() {
    const all = rg(`name:\\s*['"\`]([a-z][a-z_]*)['"\`]`, { cwd: workspaceRoot, paths: ['backend/src/kloel'], globs: ['*.ts'], maxCount: 800 });
    const VERB_PREFIXES = /^(create|save|update|delete|remove|list|get|find|fetch|send|apply|cancel|confirm|verify|generate|attach|detach|enable|disable|pause|resume|move|transfer|request|approve|reject|connect|disconnect|sync|push|pull|render|search|export|import|publish|unpublish|set|reset|grant|revoke|run|launch|stop|start|read|write|open|close|review|rate|tag|untag|assign|unassign|invite|notify|schedule|trigger|deduct|credit|debit|payout|refund|charge|capture|book|track|register|deregister|store|recall|remember|forget|switch|toggle|check|inspect|describe|explain|propose|plan)_/;
    const intents = [];
    const sources = [];
    for (const m of all.matches) {
      const mm = m.text.match(/name:\s*['"`]([a-z][a-z_]*)['"`]/);
      if (!mm) continue;
      const cand = mm[1];
      if (!cand.includes('_')) continue;
      if (!VERB_PREFIXES.test(cand)) continue;
      intents.push(cand);
      sources.push({ name: cand, file: m.file, line: m.line });
    }
    return { ok: true, intents: uniq(intents), sources };
  }

  /** UI surfaces — for each domain, look up under the configured ui globs. */
  function uiSurfacesForDomain(domain) {
    const surfaces = [];
    for (const g of domain.ui) {
      if (existsSync(join(workspaceRoot, g))) {
        const r = rgFiles('export', { cwd: workspaceRoot, paths: [g], globs: ['*.tsx', '*.ts'] });
        for (const f of r.files.slice(0, 20)) surfaces.push({ root: g, file: f });
      }
    }
    return surfaces;
  }

  /** Backend handlers for a domain — controllers + services in the configured backend globs. */
  function backendHandlersForDomain(domain) {
    const out = { controllers: [], services: [] };
    for (const g of domain.backend) {
      if (!existsSync(join(workspaceRoot, g))) continue;
      const ctrlFiles = rgFiles('@Controller', { cwd: workspaceRoot, paths: [g], globs: ['*.ts'] }).files;
      const svcFiles = rgFiles('@Injectable', { cwd: workspaceRoot, paths: [g], globs: ['*.ts'] }).files;
      out.controllers.push(...ctrlFiles);
      out.services.push(...svcFiles);
    }
    out.controllers = uniq(out.controllers);
    out.services = uniq(out.services);
    return out;
  }

  /** Resolve Prisma models referenced by a domain. */
  function prismaForDomain(domain) {
    const models = [];
    for (const name of domain.prismaModels) {
      const r = prisma.findModel(name);
      if (r.ok && r.model) models.push({ name: r.model.name, line: r.model.line, fields: r.model.fields.length, relations: r.model.relations.map((x) => x.related) });
    }
    return models;
  }

  /** Event emissions/listeners found referencing this domain. */
  function eventsForDomain(domain) {
    const out = [];
    for (const ev of domain.events) {
      const r = rg(`['"\`]${ev}['"\`]`, { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'], maxCount: 20 });
      for (const m of r.matches) out.push({ event: ev, file: m.file, line: m.line, text: m.text.trim() });
    }
    return out;
  }

  /** Trace a domain into an organised report. */
  function traceDomain(name) {
    const domain = findDomain(name);
    if (!domain) return { ok: false, error: `unknown domain: ${name}` };
    const surfaces = uiSurfacesForDomain(domain);
    const backend = backendHandlersForDomain(domain);
    const models = prismaForDomain(domain);
    const events = eventsForDomain(domain);
    const apiProxies = react.listApiProxies().proxies;
    const relevantProxies = apiProxies.filter((p) => surfaces.some((s) => p.path.toLowerCase().includes(domain.key)) || p.path.toLowerCase().includes(domain.key));
    return {
      ok: true,
      domain: { key: domain.key, label: domain.label },
      ui: { surfaces, apiProxies: relevantProxies },
      backend,
      prismaModels: models,
      events,
    };
  }

  /** Trace an endpoint (METHOD /path) all the way down. */
  function traceEndpoint(method, path) {
    const r = nestjs.resolveRoute(method, path);
    const matches = r.matches || [];
    const out = matches.map((m) => {
      const ep = nestjs.readControllerEndpoints(m.file);
      const callees = [];
      if (ep.ok && m.line) {
        // Try to resolve handler name → CodeGraph node → callees.
        const ctrlInfo = ep.endpoints.find((e) => e.line === m.line);
        if (ctrlInfo && ctrlInfo.handlerName) {
          const resolved = codegraph.resolveSymbol(ctrlInfo.handlerName, { kinds: ['method', 'function'] });
          if (resolved.ok && resolved.candidates.length) {
            const winner = resolved.candidates.find((c) => c.file_path === m.file) || resolved.candidates[0];
            const trans = codegraph.transitiveCallees(winner.id, { depth: 2, cap: 25 });
            for (const t of trans.callees || []) callees.push({ depth: t.depth, file: t.node.file_path, line: t.node.start_line, name: t.node.name, kind: t.node.kind });
          }
        }
      }
      return { ...m, callees };
    });
    return { ok: true, method: method.toUpperCase(), path, matches: out };
  }

  /** Trace a chat utterance → intent → tool → service → db. */
  function traceChatAction(message) {
    const helpers = findActionIntentHelpers();
    const intents = helpers.ok ? helpers.intents : [];
    const lower = (message || '').toLowerCase();
    const matchedIntents = intents.filter((i) => lower.includes(i.replace(/_/g, ' ')) || lower.includes(i));
    const toolDefs = [];
    for (const intent of matchedIntents.length ? matchedIntents : intents.slice(0, 5)) {
      toolDefs.push(...findChatToolDefinitions(intent).map((h) => ({ ...h, intent })));
    }
    // For each candidate tool dispatch, follow the call chain via CodeGraph.
    const expanded = [];
    for (const h of toolDefs.slice(0, 6)) {
      const m = h.text.match(/\b([A-Za-z_$][\w$]*)\s*\(/);
      if (!m) continue;
      const sym = m[1];
      const r = codegraph.resolveSymbol(sym, { kinds: ['method', 'function'] });
      if (r.ok && r.candidates.length) {
        const winner = r.candidates[0];
        const trans = codegraph.transitiveCallees(winner.id, { depth: 2, cap: 20 });
        expanded.push({
          intent: h.intent,
          symbol: sym,
          file: winner.file_path,
          line: winner.start_line,
          callees: (trans.callees || []).map((c) => ({ depth: c.depth, name: c.node.name, file: c.node.file_path, line: c.node.start_line })),
        });
      }
    }
    return {
      ok: true,
      message,
      intentsRecognized: matchedIntents,
      intentsCatalog: intents,
      toolDefs,
      callChains: expanded,
    };
  }

  /** Trace by prisma model — who reads/writes it. */
  function tracePrismaModel(modelName) {
    const found = prisma.findModel(modelName);
    if (!found.ok) return { ok: false, error: found.error };
    if (!found.model) return { ok: true, model: null, candidates: found.candidates };
    const model = found.model;
    const writes = rg(`prisma\\.${model.name[0].toLowerCase() + model.name.slice(1)}\\.(create|update|delete|upsert|createMany|updateMany|deleteMany)`,
      { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'], maxCount: 120 });
    const reads = rg(`prisma\\.${model.name[0].toLowerCase() + model.name.slice(1)}\\.(findUnique|findMany|findFirst|count|aggregate|groupBy)`,
      { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'], maxCount: 120 });
    return {
      ok: true,
      model: { name: model.name, line: model.line, fields: model.fields.map((f) => ({ name: f.name, type: f.type })), relations: model.relations },
      writes: writes.matches.map((m) => ({ file: m.file, line: m.line, text: m.text.trim() })),
      reads: reads.matches.map((m) => ({ file: m.file, line: m.line, text: m.text.trim() })),
    };
  }

  /** Trace a tool by name (Kloel chat tool / saas-compiler tool). */
  function traceTool(toolName) {
    const defs = findChatToolDefinitions(toolName);
    if (!defs.length) return { ok: true, toolName, definitions: [], callChains: [] };
    const chains = [];
    for (const def of defs.slice(0, 6)) {
      const m = def.text.match(/\b([A-Za-z_$][\w$]*)\s*\(/);
      if (!m) continue;
      const r = codegraph.resolveSymbol(m[1], { kinds: ['method', 'function'] });
      if (r.ok && r.candidates.length) {
        const c = r.candidates[0];
        const trans = codegraph.transitiveCallees(c.id, { depth: 2, cap: 25 });
        chains.push({ defFile: def.file, defLine: def.line, symbol: m[1], file: c.file_path, line: c.start_line, callees: (trans.callees || []).map((t) => ({ depth: t.depth, file: t.node.file_path, line: t.node.start_line, name: t.node.name })) });
      }
    }
    return { ok: true, toolName, definitions: defs, callChains: chains };
  }

  /** Trace event emission/listeners by event name. */
  function traceEvent(eventName) {
    const emits = rg(String.raw`emit\s*\(\s*['"\`]` + eventName + String.raw`['"\`]`, { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'], maxCount: 50 });
    const subscribes = rg(String.raw`@OnEvent\s*\(\s*['"\`]` + eventName + String.raw`['"\`]`, { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'], maxCount: 50 });
    return {
      ok: true,
      eventName,
      emit: emits.matches.map((m) => ({ file: m.file, line: m.line, text: m.text.trim() })),
      subscribe: subscribes.matches.map((m) => ({ file: m.file, line: m.line, text: m.text.trim() })),
    };
  }

  return {
    findActionIntentHelpers,
    findChatToolDefinitions,
    uiSurfacesForDomain,
    backendHandlersForDomain,
    prismaForDomain,
    eventsForDomain,
    traceDomain,
    traceEndpoint,
    traceChatAction,
    tracePrismaModel,
    traceTool,
    traceEvent,
  };
}
