#!/usr/bin/env node
// Architectural inventory scanner for the Kloel monorepo.
// Output: docs/architecture/{DOMAINS,VOCABULARY,CAPABILITY_MAP,EVENT_TAXONOMY,SERVICE_CATALOG,DUPLICATION_REGISTER}.md
//
// Pure static analysis — reads code, never modifies.

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

const ROOT = '/Users/danielpenin/whatsapp_saas';
// OUT_DIR is env-overridable so the scanner can run NON-DESTRUCTIVELY for analysis
// (several docs/architecture/*.md are hand-curated — never blind-overwrite them).
const OUT_DIR = process.env.CANON_OUT_DIR
  ? (process.env.CANON_OUT_DIR.startsWith('/') ? process.env.CANON_OUT_DIR : join(ROOT, process.env.CANON_OUT_DIR))
  : join(ROOT, 'docs/architecture');

const ROOTS = [
  'backend/src',
  'frontend/src',
  'frontend-admin/src',
  // worker/ is a flat directory (no src/), files live at worker/*.ts
  'worker',
];

const SKIP_RE = /(node_modules|dist|\.next|build|coverage|__tests__|\.spec\.|\.test\.)/;

const tsFiles = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (SKIP_RE.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mts)$/.test(e.name)) tsFiles.push(p);
  }
}
for (const r of ROOTS) walk(join(ROOT, r));

console.log(`Scanning ${tsFiles.length} TypeScript files...`);

// ─────────── extractors ───────────

const classDecl = /export\s+(?:abstract\s+)?class\s+([A-Z]\w+)/g;
const interfaceDecl = /export\s+interface\s+([A-Z]\w+)/g;
const typeDecl = /export\s+type\s+([A-Z]\w+)\s*=/g;
const funcDecl = /export\s+(?:async\s+)?function\s+([a-zA-Z_]\w*)/g;
const arrowFunc = /export\s+const\s+([a-zA-Z_]\w*)\s*[:=]\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g;
const decoratorService = /@Injectable\(\s*\)/;
const decoratorController = /@Controller\(/;
const decoratorModule = /@Module\(/;
const decoratorProcessor = /@Processor\(/;
const eventEmit = /\.emit\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
const eventOn = /\.on\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
// NestJS event-emitter
const nestEventEmit = /eventEmitter\.emit\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
const nestOnEvent = /@OnEvent\s*\(\s*['"`]([\w.:_-]+)['"`]/g;
// BullMQ — direct Queue/Worker + NestJS @Processor + @Process + BullModule.registerQueue
const queueRegister = /(?:new\s+Queue|BullModule\.registerQueue|registerQueue)\s*\(\s*[{'"]*[^'"]*['"`]?(?:name\s*:\s*)?['"`]([\w._-]+)['"`]/g;
const bullProcessor = /@Processor\(\s*['"`]([\w._-]+)['"`]/g;
const bullProcess = /@Process\(\s*['"`]([\w._-]+)['"`]/g;
// `new Worker('queue-name', ...)` — vanilla BullMQ pattern used by the worker/ tree
const bullWorker = /new\s+Worker\s*\(\s*['"`]([\w._-]+)['"`]/g;
const httpVerbs = /@(Get|Post|Put|Delete|Patch)\s*\(\s*(?:['"`]([^'"`)]*)['"`])?\s*\)/g;
const prismaModel = /prisma\.([a-zA-Z_]\w*)\./g;

const symbols = []; // { name, kind, file, line }
const services = []; // { name, file }
const controllers = []; // { name, file, route? }
const modules = []; // { name, file }
const processors = []; // { name, file, queue }
const events = new Map(); // event → [{ file, kind: 'emit'|'listen' }]
const queues = new Map(); // queueName → [files]
const routes = []; // { verb, path, file }
const prismaUsage = new Map(); // model → [files]
const exportsByName = new Map(); // name → [files]

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

for (const file of tsFiles) {
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }
  const rel = relative(ROOT, file);

  const captures = [
    { re: classDecl, kind: 'class' },
    { re: interfaceDecl, kind: 'interface' },
    { re: typeDecl, kind: 'type' },
    { re: funcDecl, kind: 'function' },
    { re: arrowFunc, kind: 'function' },
  ];
  for (const { re, kind } of captures) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      symbols.push({ name: m[1], kind, file: rel, line: lineOf(src, m.index) });
      if (!exportsByName.has(m[1])) exportsByName.set(m[1], []);
      exportsByName.get(m[1]).push(rel);
    }
  }

  // services / controllers / modules / processors
  classDecl.lastIndex = 0;
  let cm;
  while ((cm = classDecl.exec(src))) {
    const name = cm[1];
    const around = src.slice(Math.max(0, cm.index - 300), cm.index + 50);
    if (decoratorService.test(around)) services.push({ name, file: rel });
    if (decoratorController.test(around)) {
      const routeMatch = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(around);
      controllers.push({ name, file: rel, route: routeMatch?.[1] ?? '' });
    }
    if (decoratorModule.test(around)) modules.push({ name, file: rel });
    if (decoratorProcessor.test(around)) {
      const queueMatch = /@Processor\(\s*['"`]([^'"`]*)['"`]/.exec(around);
      processors.push({ name, file: rel, queue: queueMatch?.[1] ?? '' });
    }
  }

  // events — native + NestJS event-emitter
  for (const [re, kind] of [
    [eventEmit, 'emit'],
    [eventOn, 'listen'],
    [nestEventEmit, 'emit'],
    [nestOnEvent, 'listen'],
  ]) {
    re.lastIndex = 0;
    let em;
    while ((em = re.exec(src))) {
      const e = em[1];
      if (!events.has(e)) events.set(e, []);
      events.get(e).push({ file: rel, kind });
    }
  }

  // queues — BullMQ direct + NestJS BullModule.registerQueue
  queueRegister.lastIndex = 0;
  let qm;
  while ((qm = queueRegister.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }
  bullProcessor.lastIndex = 0;
  while ((qm = bullProcessor.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }
  // @Process('name') — BullMQ NestJS adapter; counts as queue consumer
  bullProcess.lastIndex = 0;
  while ((qm = bullProcess.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }
  // new Worker('queue', ...) — vanilla BullMQ consumer (worker/ tree)
  bullWorker.lastIndex = 0;
  while ((qm = bullWorker.exec(src))) {
    const q = qm[1];
    if (!queues.has(q)) queues.set(q, []);
    queues.get(q).push(rel);
  }

  // routes
  httpVerbs.lastIndex = 0;
  let rm;
  while ((rm = httpVerbs.exec(src))) {
    routes.push({ verb: rm[1].toUpperCase(), path: rm[2] ?? '', file: rel });
  }

  // prisma usage
  prismaModel.lastIndex = 0;
  let pm;
  while ((pm = prismaModel.exec(src))) {
    const model = pm[1];
    if (!prismaUsage.has(model)) prismaUsage.set(model, new Set());
    prismaUsage.get(model).add(rel);
  }
}

console.log(`Found: ${symbols.length} symbols, ${services.length} services, ${controllers.length} controllers, ${modules.length} modules, ${processors.length} processors, ${events.size} events, ${queues.size} queues, ${routes.length} routes`);

// ─────────── domain inference ───────────
// Heuristic: top-level subdirectory of backend/src OR feature folder of frontend
function domainOf(rel) {
  if (rel.startsWith('backend/src/')) {
    const parts = rel.split('/');
    return parts[2] || 'unknown';
  }
  if (rel.startsWith('frontend/src/')) {
    const parts = rel.split('/');
    if (parts[2] === 'app') return `frontend/page/${parts[3] ?? 'root'}`;
    if (parts[2] === 'components') return `frontend/components/${parts[3] ?? 'root'}`;
    return `frontend/${parts[2] ?? 'misc'}`;
  }
  if (rel.startsWith('worker/')) {
    const parts = rel.split('/');
    return `worker/${parts[2] ?? 'root'}`;
  }
  if (rel.startsWith('frontend-admin/')) {
    const parts = rel.split('/');
    return `admin/${parts[2] ?? 'root'}`;
  }
  return 'unknown';
}

const domains = new Map(); // domain → { files: Set, services: [], controllers: [], modules: [], events: Set }
function ensureDomain(d) {
  if (!domains.has(d)) domains.set(d, { files: new Set(), services: [], controllers: [], modules: [], events: new Set() });
  return domains.get(d);
}
for (const f of tsFiles) {
  const rel = relative(ROOT, f);
  ensureDomain(domainOf(rel)).files.add(rel);
}
for (const s of services) ensureDomain(domainOf(s.file)).services.push(s);
for (const c of controllers) ensureDomain(domainOf(c.file)).controllers.push(c);
for (const m of modules) ensureDomain(domainOf(m.file)).modules.push(m);
for (const [eventName, refs] of events) {
  for (const r of refs) ensureDomain(domainOf(r.file)).events.add(eventName);
}

// ─────────── duplication detection ───────────
// Semantic duplication: same canonical concept across multiple implementations.

const CANONICAL_PATTERNS = [
  { canonical: 'send_message', regex: /^(sendMessage|sendWhatsapp|sendText|sendChannel|dispatchText|dispatchMessage|deliverMessage|emitMessage|postMessage|publishMessage|wahaSend|MessageDispatch)/i },
  { canonical: 'normalize_phone', regex: /^(normalizePhone|normalizeNumber|cleanPhone|formatPhone|toE164|phoneToE164|phoneNormalize|phoneDigits|phoneOptional|phoneWhatsapp)/i },
  { canonical: 'resolve_tenant', regex: /^(resolveTenant|resolveWorkspace|getTenantId|getWorkspaceId|extractTenant|tenantFromRequest|workspaceFrom|WorkspaceContext)/i },
  { canonical: 'parse_webhook', regex: /^(parseWebhook|webhookParse|extractEvent|decodeWebhook|parseInbound|inboundParse|WebhookVerifier|verifyWebhookSignature|webhookHandler)/i },
  { canonical: 'idempotency_check', regex: /^(isIdempotent|alreadyProcessed|checkIdempotency|dedupeEvent|hasBeenSeen|Idempotency(Guard|Service|Interceptor|Fingerprint))/i },
  { canonical: 'recover_cart', regex: /^(recoverCart|abandonedCart|recoverAbandonedCart|reactivateCart|cartRecovery|CartRecovery)/i },
  { canonical: 'score_intent', regex: /^(scoreIntent|commercialIntent|computeIntent|intentScore|RuntimeIntentResolver|IntentScorer|Mind(Catalog|Commercial|Recovery)Decision)/i },
  { canonical: 'qualify_contact', regex: /^(qualifyContact|qualifyLead|leadQualification|contactQualify|ContactQualification|LeadProcessor)/i },
  { canonical: 'authenticate_user', regex: /^(authenticate|loginUser|signIn|verifyCredentials|checkCredentials|AuthService|JwtAuth|AdminAuth)/i },
  { canonical: 'connect_channel', regex: /^(connectChannel|connectWhatsapp|startSession|initSession|attachChannel|ChannelSession|WhatsappSession|MetaConnect|WahaConnect)/i },
  { canonical: 'process_payment', regex: /^(processPayment|chargePayment|capturePayment|confirmPayment|payNow|PaymentIntent|StripeCharge|MercadoPagoCharge|PaymentService)/i },
  { canonical: 'create_checkout', regex: /^(createCheckout|startCheckout|initCheckout|buildCheckout|newCheckout|CheckoutSession|CheckoutPayment)/i },
  { canonical: 'verify_webhook_signature', regex: /^(verifyWebhookSignature|validateStripeSignature|validateMpSignature|validateMercadoPagoSignature|checkSignature|hmacVerify)/i },
  { canonical: 'split_payment', regex: /^(splitPayment|splitEngine|computeSplit|SplitEngine|MarketplaceSplit)/i },
  { canonical: 'ledger_entry', regex: /^(LedgerEntry|ledgerWrite|recordTransaction|writeLedger|appendLedger|LedgerService)/i },
  { canonical: 'fraud_check', regex: /^(fraudCheck|FraudEngine|assessFraud|fraudScore|riskScore|RiskClass)/i },
  { canonical: 'kyc_verify', regex: /^(verifyKyc|KycVerification|kycSubmit|KycService|onboardingKyc)/i },
];

const capabilityMap = new Map();
for (const p of CANONICAL_PATTERNS) capabilityMap.set(p.canonical, []);

for (const sym of symbols) {
  if (sym.kind !== 'function' && sym.kind !== 'class') continue;
  for (const p of CANONICAL_PATTERNS) {
    if (p.regex.test(sym.name)) {
      capabilityMap.get(p.canonical).push(sym);
    }
  }
}

// Also detect exact-name duplicates across files
const exactDuplicates = [];
for (const [name, files] of exportsByName) {
  if (files.length > 1 && /^[a-zA-Z][\w]{2,}$/.test(name)) {
    // ignore noise like single-char or common
    const uniqueFiles = [...new Set(files)];
    if (uniqueFiles.length > 1) {
      exactDuplicates.push({ name, files: uniqueFiles });
    }
  }
}
exactDuplicates.sort((a, b) => b.files.length - a.files.length);

// ─────────── event taxonomy normalization ───────────
const eventCanonical = new Map(); // canonical → [variants]
for (const [event] of events) {
  // Canonicalize to lower-dot form
  const canonical = event
    .replace(/[._:\-]+/g, '.')
    .toLowerCase();
  if (!eventCanonical.has(canonical)) eventCanonical.set(canonical, new Set());
  eventCanonical.get(canonical).add(event);
}
const eventDuplicates = [...eventCanonical.entries()].filter(([, variants]) => variants.size > 1);

// ─────────── write outputs ───────────
import { writeOutputs } from './scan-writers.mjs';
writeOutputs({ OUT_DIR, domains, services, controllers, modules, processors, events, queues, routes, prismaUsage, symbols, fileCount: tsFiles.length, domainOf, capabilityMap, eventDuplicates, exactDuplicates });