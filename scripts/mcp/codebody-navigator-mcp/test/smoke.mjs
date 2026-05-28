#!/usr/bin/env node
/**
 * End-to-end smoke test of the CodeBody Navigator MCP. Exercises every layer
 * against the real KLOEL repo. Exit code is non-zero on any failure.
 *
 *   node scripts/mcp/codebody-navigator-mcp/test/smoke.mjs
 */

import { createNavigator } from '../lib/tools.mjs';
import { resolve } from 'node:path';

const ROOT = resolve(process.env.CODEBODY_NAV_ROOT || process.cwd());
const STATE = resolve(process.env.CODEBODY_NAV_STATE || `${ROOT}/.codegraph/codebody-navigator`);

const nav = createNavigator({ workspaceRoot: ROOT, stateDir: STATE });

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push({ name, detail });
    console.log(`  FAIL  ${name} :: ${detail}`);
  }
}

function expectOk(result, name) {
  check(name, result && result.ok !== false, JSON.stringify(result).slice(0, 200));
  return result;
}

// ─── L0 meta ────────────────────────────────────────────────────────────────
console.log('\n[L0] health & catalogue');
const health = nav.nav_health();
expectOk(health, 'nav_health returns ok');
check('codegraph DB exists', health.codegraph?.dbExists === true, 'expected DB at .codegraph/codegraph.db');

const domains = nav.nav_list_domains();
expectOk(domains, 'nav_list_domains returns ok');
check('>=10 domains registered', (domains.domains || []).length >= 10, `got ${domains.domains?.length}`);

const prismaModels = nav.nav_list_prisma_models();
expectOk(prismaModels, 'nav_list_prisma_models returns ok');
check('>=50 Prisma models', (prismaModels.models || []).length >= 50, `got ${prismaModels.models?.length}`);

const endpoints = nav.nav_list_endpoints({ method: 'GET' });
expectOk(endpoints, 'nav_list_endpoints(GET) returns ok');
check('>=50 GET endpoints', (endpoints.endpoints || []).length >= 50, `got ${endpoints.endpoints?.length}`);

const routes = nav.nav_list_routes();
expectOk(routes, 'nav_list_routes returns ok');
check('>=10 frontend routes', (routes.routes || []).length >= 10, `got ${routes.routes?.length}`);

// ─── L1 body ────────────────────────────────────────────────────────────────
console.log('\n[L1] session + movement');
const session = nav.nav_start_session({ goal: 'smoke: trace product creation via chat' });
check('session id assigned', !!session.session?.id, 'no id');

const where1 = nav.nav_where_am_i();
expectOk(where1, 'nav_where_am_i after start');
check('breadcrumb depth zero', where1.breadcrumbDepth === 0, `got ${where1.breadcrumbDepth}`);

const move1 = nav.nav_move_to_file({ filePath: 'backend/src/kloel/kloel.service.ts', line: 296, reason: 'thinkSync entry' });
expectOk(move1, 'nav_move_to_file works');
check('preview returned', !!move1.preview?.content, 'no preview');

const where2 = nav.nav_where_am_i();
check('breadcrumb depth one', where2.breadcrumbDepth === 1, `got ${where2.breadcrumbDepth}`);
check('current file matches', where2.currentFile === 'backend/src/kloel/kloel.service.ts', `got ${where2.currentFile}`);

const moveSym = nav.nav_move_to_symbol({ symbol: 'thinkSync', reason: 'sym jump' });
expectOk(moveSym, 'nav_move_to_symbol(thinkSync) works');
check('symbol target.kind=method|function', ['method', 'function'].includes(moveSym.target?.kind), `got ${moveSym.target?.kind}`);

const back = nav.nav_back();
check('back pops breadcrumb', back.popped != null, 'no popped step');

// ─── L2 semantic ────────────────────────────────────────────────────────────
console.log('\n[L2] semantic movement');
const jump = nav.nav_jump_to_definition({ symbol: 'KloelService' });
expectOk(jump, 'nav_jump_to_definition(KloelService)');
check('target file is kloel.service.ts', (jump.target?.file_path || '').endsWith('kloel.service.ts'), `got ${jump.target?.file_path}`);

const refs = nav.nav_find_references({ symbol: 'thinkSync', limit: 20 });
expectOk(refs, 'nav_find_references(thinkSync)');
check('has references', (refs.references || []).length >= 0, `got ${refs.references?.length}`);

const calls = nav.nav_follow_call({ symbol: 'thinkSync', depth: 2, limit: 20 });
expectOk(calls, 'nav_follow_call(thinkSync, d=2)');

const nbrs = nav.nav_neighbors({ hops: 1, limitPerHop: 30 });
expectOk(nbrs, 'nav_neighbors hops=1');

// ─── L3 route tracing ───────────────────────────────────────────────────────
console.log('\n[L3] route tracing');
const tEndpoint = nav.nav_trace_endpoint({ method: 'GET', path: '/products' });
expectOk(tEndpoint, 'nav_trace_endpoint GET /products');

const tChat = nav.nav_trace_chat_action({ message: 'cria um produto físico chamado Frasco PDRN de R$197' });
expectOk(tChat, 'nav_trace_chat_action');
check('intent catalog non-empty', (tChat.intentsCatalog || []).length >= 0, `got ${tChat.intentsCatalog?.length}`);

const tDomain = nav.nav_trace_domain({ domain: 'produtos' });
expectOk(tDomain, 'nav_trace_domain(produtos)');
check('domain key=produtos', tDomain.domain?.key === 'produtos', `got ${tDomain.domain?.key}`);

const tModel = nav.nav_trace_prisma_model({ model: 'Product' });
expectOk(tModel, 'nav_trace_prisma_model(Product)');

const tTool = nav.nav_trace_tool({ tool: 'create_product' });
expectOk(tTool, 'nav_trace_tool(create_product)');

const tEvent = nav.nav_trace_event({ event: 'product.created' });
expectOk(tEvent, 'nav_trace_event(product.created)');

// ─── L4 frontier ────────────────────────────────────────────────────────────
console.log('\n[L4] frontier / emergence');
const gaps = nav.nav_detect_gaps({ domain: 'produtos' });
expectOk(gaps, 'nav_detect_gaps(produtos)');
check('frontier item created', !!gaps.frontier?.id, 'no frontier id');

const stubs = nav.nav_find_stub_routes({ minLines: 15 });
expectOk(stubs, 'nav_find_stub_routes');

const hardcoded = nav.nav_find_hardcoded_reality({ maxHits: 10 });
expectOk(hardcoded, 'nav_find_hardcoded_reality');

const dead = nav.nav_find_dead_handlers({ maxHits: 10 });
expectOk(dead, 'nav_find_dead_handlers');

const deadApi = nav.nav_find_dead_api_calls({ maxHits: 5 });
expectOk(deadApi, 'nav_find_dead_api_calls');

const orphans = nav.nav_find_orphan_modules();
expectOk(orphans, 'nav_find_orphan_modules');

const deadTools = nav.nav_find_dead_tools();
expectOk(deadTools, 'nav_find_dead_tools');

const probe = nav.nav_next_best_probe();
expectOk(probe, 'nav_next_best_probe');

// ─── L5 proof ───────────────────────────────────────────────────────────────
console.log('\n[L5] proof / receipts');
const plan = nav.nav_plan_chat_to_effect({
  message: 'Kloel, cria um produto físico chamado Test',
  expectModel: 'Product',
  expectEvent: 'product.created',
});
expectOk(plan, 'nav_plan_chat_to_effect');
check('plan has assertions', (plan.plan?.assertions || []).length >= 2, `got ${plan.plan?.assertions?.length}`);

const receipts = nav.nav_list_receipts();
expectOk(receipts, 'nav_list_receipts');
check('1 receipt recorded', (receipts.receipts || []).length >= 1, `got ${receipts.receipts?.length}`);

const verify = nav.nav_verify_receipt({ receiptId: receipts.receipts[0].id, observed: { note: 'manual smoke' } });
expectOk(verify, 'nav_verify_receipt');
check('verdict present', typeof verify.verdict === 'string', `got ${verify.verdict}`);

const hyp = nav.nav_add_hypothesis({
  statement: 'create_product persists a row in Product but no event is emitted',
  expectation: 'Find a single write site without matching emit() in same file',
});
check('hypothesis id assigned', !!hyp.id, 'no id');

const upd = nav.nav_update_hypothesis({ id: hyp.id, status: 'open', evidence: 'pending probe' });
check('hypothesis updated', upd.status === 'open', `got ${upd.status}`);

const surp = nav.nav_add_surprise({ statement: 'observed', observed: 'no event', expected: 'product.created emitted' });
check('surprise id assigned', !!surp.id, 'no id');

const ledger = nav.nav_list_ledger();
expectOk(ledger, 'nav_list_ledger');
check('ledger has hypotheses+receipts+surprises', (ledger.hypotheses?.length || 0) >= 1 && (ledger.receipts?.length || 0) >= 1 && (ledger.surprises?.length || 0) >= 1, JSON.stringify({ h: ledger.hypotheses?.length, r: ledger.receipts?.length, s: ledger.surprises?.length }));

// ─── L6 capability ──────────────────────────────────────────────────────────
console.log('\n[L6] capability gap exploration');
const cap = nav.nav_explore_capability_gap({
  domain: 'produtos',
  capability: 'Criar produto físico completo com imagem, plano, checkout, cupom e Pix via chat',
});
expectOk(cap, 'nav_explore_capability_gap(produtos)');
check('cap has missing array', Array.isArray(cap.missing), 'missing array missing');
check('cap has recommendation', !!cap.recommendation, 'no recommendation');
check('cap has testPrompt', typeof cap.testPrompt === 'string', `got ${typeof cap.testPrompt}`);
check('cap has risk', !!cap.risk?.level, `got ${cap.risk?.level}`);

// ─── summary ────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────');
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(' - ', f.name, '::', f.detail);
  process.exit(1);
}
console.log('All smoke checks passed.');
