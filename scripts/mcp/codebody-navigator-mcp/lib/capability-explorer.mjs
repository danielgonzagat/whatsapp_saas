// Capability gap explorer — the headline of the Navigator.
// Given (domain, capability description), synthesises:
//   1. What the UI currently allows
//   2. What the backend currently supports
//   3. What the DB currently models
//   4. What the chat tool layer can already do
//   5. The exact gaps (missing endpoint / model / event / receipt / UI affordance)
//   6. The smallest next-edit recommendation
//
// This is the function that turns "files on disk" into a navigable map of
// product-level capabilities.

import { findDomain } from './kloel-domain-map.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rg, rgFiles } from './ripgrep.mjs';

function uniq(items) {
  return Array.from(new Set(items));
}

export function createCapabilityExplorer({ workspaceRoot, codegraph, nestjs, react, prisma, tracer, gaps }) {
  function explore({ domain: domainName, capability }) {
    const domain = findDomain(domainName);
    if (!domain) return { ok: false, error: `unknown domain: ${domainName}` };

    const trace = tracer.traceDomain(domain.key);
    if (!trace.ok) return trace;
    const summary = gaps.summarizeDomain(domain.key);

    const capLower = (capability || '').toLowerCase();
    const capTerms = uniq(
      capLower
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !['that', 'with', 'from', 'this', 'into', 'para', 'pelo', 'pela', 'como', 'cria', 'criar'].includes(t)),
    );

    // 1. UI: search ui globs for capability terms.
    const uiHits = [];
    for (const term of capTerms.slice(0, 6)) {
      for (const g of domain.ui) {
        const r = rg(term, { cwd: workspaceRoot, paths: [g], globs: ['*.tsx', '*.ts'], maxCount: 6 });
        for (const m of r.matches) uiHits.push({ term, file: m.file, line: m.line, text: m.text.trim() });
      }
    }
    // 2. Backend: search backend globs for capability terms.
    const backendHits = [];
    for (const term of capTerms.slice(0, 6)) {
      for (const g of domain.backend) {
        const r = rg(term, { cwd: workspaceRoot, paths: [g], globs: ['*.ts'], maxCount: 6 });
        for (const m of r.matches) backendHits.push({ term, file: m.file, line: m.line, text: m.text.trim() });
      }
    }
    // 3. Prisma fields/models matching terms.
    const allModels = prisma.listModels().models || [];
    const modelHits = allModels
      .filter((m) => capTerms.some((t) => m.name.toLowerCase().includes(t)))
      .map((m) => ({ name: m.name, line: m.line, fieldCount: m.fieldCount }));
    // 4. Chat tools mentioning terms.
    const toolHits = [];
    for (const term of capTerms.slice(0, 6)) {
      const r = rg(`name:\\s*['"\`]([a-z_]*${term}[a-z_]*)['"\`]`, { cwd: workspaceRoot, paths: ['backend/src/kloel'], globs: ['*.ts'], maxCount: 6 });
      for (const m of r.matches) toolHits.push({ term, file: m.file, line: m.line, text: m.text.trim() });
    }

    // 5. Missing analysis.
    const missing = [];
    if (uiHits.length === 0) missing.push({ layer: 'ui', detail: `No UI affordance matches "${capTerms.join(' ')}" under ${domain.ui.join(', ')}` });
    if (backendHits.length === 0) missing.push({ layer: 'backend', detail: `No backend handler matches "${capTerms.join(' ')}" under ${domain.backend.join(', ')}` });
    if (modelHits.length === 0) missing.push({ layer: 'prisma', detail: `No Prisma model name matches terms ${capTerms.join(', ')}` });
    if (toolHits.length === 0) missing.push({ layer: 'chat_tool', detail: `No Kloel chat tool with terms ${capTerms.join(', ')}` });
    if (summary.ok) {
      if ((summary.gaps?.modelsWritingWithoutEvents || []).length) missing.push({ layer: 'events', detail: 'Some writes do not emit configured events.', samples: summary.gaps.modelsWritingWithoutEvents.slice(0, 3) });
      if ((summary.gaps?.modelsWritingWithoutReceipts || []).length) missing.push({ layer: 'receipts', detail: 'Some writes are not paired with OperationReceipt.', samples: summary.gaps.modelsWritingWithoutReceipts.slice(0, 3) });
    }

    // 6. Smallest next-edit suggestion.
    const recommendation = pickRecommendation({ domain, missing, uiHits, backendHits, modelHits, toolHits });

    // 7. Test prompt — concrete chat phrasing the agent can use.
    const testPrompt = buildTestPrompt(domain, capability);

    return {
      ok: true,
      domain: { key: domain.key, label: domain.label },
      capability,
      capabilityTerms: capTerms,
      whatUiAllows: uiHits.slice(0, 8),
      whatBackendSupports: backendHits.slice(0, 8),
      whatDbModels: modelHits,
      whatChatCanDo: toolHits.slice(0, 8),
      missing,
      recommendation,
      testPrompt,
      relatedEvents: trace.events.slice(0, 5),
      risk: assessRisk(domain),
    };
  }

  function pickRecommendation({ domain, missing, uiHits, backendHits, modelHits, toolHits }) {
    if (missing.find((m) => m.layer === 'backend')) {
      return { layer: 'backend', edit: `Create or extend a controller under ${domain.backend[0] || 'backend/src/' + domain.key}/ with the missing endpoint, plus its service and DTO.` };
    }
    if (missing.find((m) => m.layer === 'chat_tool')) {
      return { layer: 'chat_tool', edit: 'Register a new chat tool in backend/src/kloel/kloel-*-tools.service.ts and wire it through kloel-tool-dispatcher.service.ts.' };
    }
    if (missing.find((m) => m.layer === 'ui')) {
      return { layer: 'ui', edit: `Add a UI affordance under ${domain.ui[0]}; reuse existing apiFetch/SWR hooks before introducing new ones.` };
    }
    if (missing.find((m) => m.layer === 'events')) {
      return { layer: 'events', edit: `After Prisma write, emit the domain event (e.g. ${domain.events[0]}) via EventEmitter2.` };
    }
    if (missing.find((m) => m.layer === 'receipts')) {
      return { layer: 'receipts', edit: 'Pair the Prisma write with an OperationReceipt entry (truthReceipt) for the action.' };
    }
    return { layer: 'tests', edit: 'All layers present — add an end-to-end test that asserts UI → API → DB + event for this capability.' };
  }

  function buildTestPrompt(domain, capability) {
    const example = {
      produtos: 'Kloel, cria um produto físico chamado "Frasco PDRN" de R$ 197 com 1 plano e checkout.',
      checkout: 'Kloel, gera o link de checkout do produto X.',
      wallet: 'Kloel, qual é o saldo da minha carteira hoje?',
      whatsapp: 'Kloel, conecta o WhatsApp do meu workspace.',
      crm: 'Kloel, move o contato Maria pra etapa "Negociação".',
      campaigns: 'Kloel, lança a campanha "Promo de Maio" pros últimos 50 leads.',
      autopilot: 'Kloel, ativa o autopilot pro produto Y.',
    };
    return example[domain.key] || `Kloel, execute esta capacidade no domínio ${domain.label}: ${capability}`;
  }

  function assessRisk(domain) {
    const high = ['wallet', 'checkout', 'billing', 'kyc', 'auth'];
    const medium = ['whatsapp', 'autopilot', 'flows', 'campaigns', 'affiliate'];
    if (high.includes(domain.key)) return { level: 'high', reason: 'financial / identity surface — needs idempotency + audit + workspace isolation' };
    if (medium.includes(domain.key)) return { level: 'medium', reason: 'external integration / messaging surface — needs rate limit + retries' };
    return { level: 'low', reason: 'non-financial / internal surface' };
  }

  return { explore };
}
