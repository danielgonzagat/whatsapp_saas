// Gap / frontier detection — for a given route or domain, surfaces things
// that look missing (no event emitted after write, no receipt logged, no
// handler for a frontend call, no tests, hardcoded data, etc.).
//
// The detectors are intentionally conservative; they are *hints* the
// navigator can use to mint Frontier items and Hypotheses, not authoritative
// indictments. Each hint includes evidence (file:line) so an agent can verify.

import { rg, rgFiles } from './ripgrep.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findDomain, listDomains } from './kloel-domain-map.mjs';

function fileHas(workspaceRoot, file, pattern) {
  const abs = join(workspaceRoot, file);
  if (!existsSync(abs)) return false;
  try {
    return new RegExp(pattern).test(readFileSync(abs, 'utf8'));
  } catch {
    return false;
  }
}

export function createGapDetector({ workspaceRoot, codegraph, nestjs, react, prisma, tracer }) {
  function detectMissingEvents(domainName) {
    const domain = findDomain(domainName);
    if (!domain) return { ok: false, error: `unknown domain: ${domainName}` };
    const writeFiles = [];
    for (const model of domain.prismaModels) {
      const r = rgFiles(`prisma\\.${model[0].toLowerCase() + model.slice(1)}\\.(create|update|delete|upsert|createMany|updateMany|deleteMany)`,
        { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'] });
      for (const f of r.files) writeFiles.push({ model, file: f });
    }
    // For each write site, check if the *same* file emits any of the domain's
    // configured event names. Heuristic but useful.
    const missing = [];
    for (const { model, file } of writeFiles) {
      const fileEmitsAny = domain.events.some((ev) => fileHas(workspaceRoot, file, `['"\`]` + ev.replace(/[.\\]/g, '\\$&') + `['"\`]`));
      if (!fileEmitsAny) missing.push({ model, file, expectedEvents: domain.events });
    }
    return { ok: true, domain: domain.label, missing };
  }

  function detectMissingReceipts(domainName) {
    const domain = findDomain(domainName);
    if (!domain) return { ok: false, error: `unknown domain: ${domainName}` };
    const writeFiles = [];
    for (const model of domain.prismaModels) {
      const r = rgFiles(`prisma\\.${model[0].toLowerCase() + model.slice(1)}\\.(create|update|delete|upsert)`,
        { cwd: workspaceRoot, paths: ['backend/src', 'worker'], globs: ['*.ts'] });
      for (const f of r.files) writeFiles.push({ model, file: f });
    }
    const missing = [];
    for (const { model, file } of writeFiles) {
      const hasReceipt = fileHas(workspaceRoot, file, 'OperationReceipt|operation_receipt|truthReceipt|truth_receipt');
      if (!hasReceipt) missing.push({ model, file });
    }
    return { ok: true, domain: domain.label, missing };
  }

  function detectStubRoutes({ minLines = 15, maxFiles = 200 } = {}) {
    const routes = react.listRoutes().routes;
    const stubs = [];
    for (const r of routes) {
      const abs = join(workspaceRoot, r.file);
      if (!existsSync(abs)) continue;
      const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
      if (lines.length < minLines) stubs.push({ ...r, lines: lines.length });
      if (stubs.length >= maxFiles) break;
    }
    return { ok: true, count: stubs.length, stubs };
  }

  function detectHardcodedReality({ paths = ['frontend/src'], maxHits = 80 } = {}) {
    const hits = [];
    const patterns = [
      'Math\\.random\\(',
      'localStorage\\.(setItem|getItem)',
      'TODO|FIXME|MOCK_DATA|FAKE_DATA',
    ];
    for (const p of patterns) {
      const r = rg(p, { cwd: workspaceRoot, paths, globs: ['*.ts', '*.tsx'], maxCount: 40 });
      for (const m of r.matches) {
        hits.push({ pattern: p, file: m.file, line: m.line, text: m.text.trim() });
        if (hits.length >= maxHits) break;
      }
      if (hits.length >= maxHits) break;
    }
    return { ok: true, hits };
  }

  function detectDeadHandlers({ maxHits = 60 } = {}) {
    // Button handlers that are no-ops or console.log only.
    const out = [];
    const noopRe = String.raw`onClick\s*=\s*\{?\s*\(\s*\)\s*=>\s*(?:\{\s*\}|console\.log\(|undefined)`;
    const r = rg(noopRe, { cwd: workspaceRoot, paths: ['frontend/src'], globs: ['*.tsx'], maxCount: maxHits });
    for (const m of r.matches) out.push({ file: m.file, line: m.line, text: m.text.trim() });
    return { ok: true, deadHandlers: out };
  }

  function detectDeadApiCalls({ maxHits = 60 } = {}) {
    // apiFetch to a route that no proxy and no backend endpoint resolves to.
    const apiFetchRe = String.raw`apiFetch\s*\(\s*['"\`]([^'"\`]+)['"\`]`;
    const r = rg(apiFetchRe, { cwd: workspaceRoot, paths: ['frontend/src'], globs: ['*.ts', '*.tsx'], maxCount: 300 });
    const proxies = react.listApiProxies().proxies;
    const proxyPaths = new Set(proxies.map((p) => p.path));
    const dead = [];
    for (const m of r.matches) {
      const path = (m.text.match(/apiFetch\s*\(\s*['"`]([^'"`]+)['"`]/) || [])[1];
      if (!path) continue;
      if (proxyPaths.has(path) || proxyPaths.has(path.split('?')[0])) continue;
      const ep = nestjs.resolveRoute('GET', path);
      const epPost = nestjs.resolveRoute('POST', path);
      if (!ep.matches.length && !epPost.matches.length) {
        dead.push({ file: m.file, line: m.line, path, text: m.text.trim() });
        if (dead.length >= maxHits) break;
      }
    }
    return { ok: true, deadApiCalls: dead };
  }

  function detectOrphanModules() {
    // Backend module files that no `imports: [` array mentions.
    const moduleFiles = rgFiles('@Module\\(', { cwd: workspaceRoot, paths: ['backend/src'], globs: ['*.module.ts'] }).files;
    const orphans = [];
    for (const file of moduleFiles) {
      const base = file.split('/').pop().replace(/\.module\.ts$/, '');
      const cls = base.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('') + 'Module';
      const refs = rgFiles(`\\b${cls}\\b`, { cwd: workspaceRoot, paths: ['backend/src'], globs: ['*.ts'] }).files;
      const others = refs.filter((f) => f !== file);
      if (others.length === 0) orphans.push({ file, suspectedClass: cls });
    }
    return { ok: true, orphans };
  }

  function detectDeadTools() {
    // Kloel chat tools defined but never dispatched.
    // Tighten the regex: only accept names that look like verbs+entities
    // (e.g. create_product, send_whatsapp, get_balance). Lone nouns like
    // "redis", "asc", "n" — captured from object keys named `name:` in
    // unrelated config blocks — are filtered out.
    const defs = rg(`name:\\s*['"\`]([a-z][a-z_]*)['"\`]`, { cwd: workspaceRoot, paths: ['backend/src/kloel'], globs: ['*.ts'], maxCount: 400 });
    const tools = new Set();
    const VERB_PREFIXES = /^(create|save|update|delete|remove|list|get|find|fetch|send|apply|cancel|confirm|verify|generate|attach|detach|enable|disable|pause|resume|move|transfer|request|approve|reject|connect|disconnect|sync|push|pull|render|search|export|import|publish|unpublish|set|reset|grant|revoke|run|launch|stop|start|read|write|open|close|review|rate|tag|untag|assign|unassign|invite|notify|schedule|trigger|deduct|credit|debit|payout|refund|charge|capture|book|schedule|track|register|deregister)_/;
    for (const m of defs.matches) {
      const mm = m.text.match(/name:\s*['"`]([a-z][a-z_]*)['"`]/);
      if (!mm) continue;
      const cand = mm[1];
      if (!cand.includes('_')) continue;        // multi-word only
      if (!VERB_PREFIXES.test(cand)) continue;  // verb-led only
      tools.add(cand);
    }
    const dead = [];
    for (const tool of tools) {
      const r = rg(`case\\s+['"\`]${tool}['"\`]`, { cwd: workspaceRoot, paths: ['backend/src/kloel'], globs: ['*.ts'] });
      if (!r.matches.length) dead.push(tool);
    }
    return { ok: true, dead };
  }

  function summarizeDomain(domainName) {
    const trace = tracer.traceDomain(domainName);
    if (!trace.ok) return trace;
    const events = detectMissingEvents(domainName);
    const receipts = detectMissingReceipts(domainName);
    return {
      ok: true,
      domain: trace.domain,
      ui: { surfaceCount: trace.ui.surfaces.length, sample: trace.ui.surfaces.slice(0, 5) },
      backend: { controllerCount: trace.backend.controllers.length, serviceCount: trace.backend.services.length },
      prisma: { modelCount: trace.prismaModels.length, models: trace.prismaModels.map((m) => m.name) },
      events: { emittedSamples: trace.events.length },
      gaps: {
        modelsWritingWithoutEvents: events.missing,
        modelsWritingWithoutReceipts: receipts.missing,
      },
    };
  }

  function detectCapabilityGaps() {
    const out = [];
    for (const dRec of listDomains()) {
      const sum = summarizeDomain(dRec.key);
      if (!sum.ok) continue;
      out.push(sum);
    }
    return { ok: true, domains: out };
  }

  return {
    detectMissingEvents,
    detectMissingReceipts,
    detectStubRoutes,
    detectHardcodedReality,
    detectDeadHandlers,
    detectDeadApiCalls,
    detectOrphanModules,
    detectDeadTools,
    summarizeDomain,
    detectCapabilityGaps,
  };
}
