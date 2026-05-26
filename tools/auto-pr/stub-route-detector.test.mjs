#!/usr/bin/env node
// Unit tests for stub-route-detector.mjs detectReason logic.
// Run: node tools/auto-pr/stub-route-detector.test.mjs

import { ok, strictEqual } from 'node:assert';

function executableLines(src) {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/')) return false;
    if (t === '{' || t === '}' || t === '(' || t === ')') return false;
    if (t.startsWith('import ') || t.startsWith('export ')) return false;
    return true;
  }).length;
}

function detectReason(src) {
  if (/import\s+\w+View\s+from\s+['"]@\/components\/kloel\//.test(src) && /<[A-Z]\w+/.test(src)) return null;
  if (/\/\*\*[\s\S]*?\*\//.test(src) && /redirect\(['"`]\/[^'"`]+['"`]\)/.test(src)) return null;
  if (/(?:em\s+breve|não\s+está\s+disponível|setup-required)/i.test(src)) return null;
  if (/redirect\(['"`]\/[^'"`]+['"`]\)/.test(src) && !/<[A-Z]/.test(src)) return 'redirect-only';
  if (/return\s+null\s*[;}]/.test(src)) return 'returns-null';
  if (/(?:Coming\s+soon|Em\s+breve|Em\s+constru[ção]+)/i.test(src)) return 'placeholder-marker';
  const markerTokens = ['TODO', 'FIXME', 'HACK', 'XXX'];
  const markerRe = new RegExp('//\\s*(?:' + markerTokens.join('|') + ')\\b|/\\*\\s*(?:' + markerTokens.join('|') + ')\\b');
  if (markerRe.test(src)) {
    const loc = executableLines(src);
    if (loc < 30) return 'placeholder-comment-only';
  }
  const loc = executableLines(src);
  if (loc < 15) return 'tiny-' + loc + '-loc';
  return null;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  OK  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + ': ' + e.message); }
}

console.log('\nRegression — existing stub patterns:');
test('redirect-only: bare redirect no JSX', () => {
  strictEqual(detectReason("import { redirect } from 'next/navigation';\nexport default function Page() {\n  redirect('/somewhere');\n}"), 'redirect-only');
});
test('returns-null: body returns null', () => {
  strictEqual(detectReason('export default function Page() {\n  return null;\n}'), 'returns-null');
});
test('placeholder-marker: English Coming soon', () => {
  strictEqual(detectReason('export default function Page() {\n  return <div>Coming soon</div>;\n}'), 'placeholder-marker');
});
test('tiny-N-loc: very short real page', () => {
  const r = detectReason('export default function Page() {\n  return <span>hi</span>;\n}');
  ok(r && r.startsWith('tiny-'), 'got ' + r);
});
test('placeholder-comment-only: TODO low loc', () => {
  strictEqual(detectReason('// TODO: implement this\nexport default function Page() {\n  return <div />;\n}'), 'placeholder-comment-only');
});

console.log('\nPattern A — Delegate-to-view (expect null):');
test('A1: ProdutosView delegate', () => {
  strictEqual(detectReason("import ProdutosView from '@/components/kloel/produtos/ProdutosView';\n\n/** Page. */\nexport default function Page() {\n  return <ProdutosView defaultTab=\"produtos\" />;\n}"), null);
});
test('A2: VendasView delegate', () => {
  strictEqual(detectReason("import VendasView from '@/components/kloel/vendas/VendasView';\n\nexport default function Page() {\n  return <VendasView />;\n}"), null);
});
test('A3: AnunciosView delegate', () => {
  strictEqual(detectReason("import AnunciosView from '@/components/kloel/anuncios/AnunciosView';\n\nexport default function Page() {\n  return <AnunciosView defaultTab=\"google\" />;\n}"), null);
});
test('A4: MarketingView delegate', () => {
  strictEqual(detectReason("import MarketingView from '@/components/kloel/marketing/MarketingView';\n\nexport default function Page() {\n  return <MarketingView defaultTab=\"google-ads\" />;\n}"), null);
});

console.log('\nPattern B — Documented redirect (expect null):');
test('B1: billing redirect with JSDoc', () => {
  strictEqual(detectReason("import { redirect } from 'next/navigation';\n\n/**\n * /billing redirects to /settings billing section.\n */\nexport default function Page() {\n  redirect('/settings?section=billing');\n}"), null);
});
test('B2: conversas redirect with spec ref', () => {
  strictEqual(detectReason("import { redirect } from 'next/navigation';\n\n/**\n * Conversas left the Marketing menu (spec §15).\n */\nexport default function Page() {\n  redirect('/inbox');\n}"), null);
});
test('B3: single-line JSDoc redirect', () => {
  strictEqual(detectReason("import { redirect } from 'next/navigation';\n\n/** Legacy alias. */\nexport default function Page() {\n  redirect('/settings');\n}"), null);
});

console.log('\nPattern C — Honest empty-state (expect null):');
test('C1: em breve', () => {
  strictEqual(detectReason('export default function Page() {\n  return <div>Em breve</div>;\n}'), null);
});
test('C2: não está disponível', () => {
  strictEqual(detectReason('export default function Page() {\n  return <p>Esta funcionalidade não está disponível.</p>;\n}'), null);
});
test('C3: setup-required', () => {
  strictEqual(detectReason('export default function Page() {\n  return <div data-state="setup-required">Configure</div>;\n}'), null);
});

console.log('\nEdge cases — still stubs:');
test('E1: undocumented redirect still stub', () => {
  strictEqual(detectReason("import { redirect } from 'next/navigation';\nexport default function Page() {\n  redirect('/foo');\n}"), 'redirect-only');
});
test('E2: View import without JSX still tiny', () => {
  const r = detectReason("import SomeView from '@/components/kloel/foo/SomeView';\nexport default function Page() {\n  console.log('nope');\n}");
  ok(r && r.startsWith('tiny-'), 'got ' + r);
});

console.log('\n' + '='.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total');
console.log('='.repeat(50));
if (failed > 0) process.exit(1);
