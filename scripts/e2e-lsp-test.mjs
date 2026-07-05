#!/usr/bin/env node
/**
 * E2E test: Atomic LSP Mesh integration
 * 
 * Tests the full pipeline:
 * 1. LSP diagnostics via lsp-mesh router CLI
 * 2. LSP references via lsp-mesh router CLI  
 * 3. LSP symbols via lsp-mesh router CLI
 * 4. LSP hover via lsp-mesh router CLI
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..');
const MESH = resolve(REPO, 'tools', 'lsp-mesh', 'lsp-router.mjs');
const TEST_FILE = resolve(REPO, 'scripts', 'mcp', 'atomic-edit', 'founder.ts');

function run(op, file, lang, line = 1, char = 0) {
  return new Promise((resolve) => {
    const args = [MESH, op, file, lang, String(line), String(char)];
    const p = spawn('node', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', c => out += c);
    p.stderr.on('data', c => err += c);
    p.on('close', code => {
      try { resolve({ ok: true, data: JSON.parse(out) }); }
      catch { resolve({ ok: false, error: out || err, code }); }
    });
    setTimeout(() => { p.kill(); resolve({ ok: false, error: 'timeout' }); }, 20000);
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  ATOMIC LSP MESH — END-TO-END VERIFICATION     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Test 1: Diagnostics
  console.log('1. DIAGNOSTICS (TypeScript on founder.ts)');
  const diag = await run('diagnostics', TEST_FILE, 'typescript');
  if (diag.ok && diag.data?.ok) {
    const d = diag.data.data;
    console.log(`   ✅ Language: ${diag.data.language} | Workspace: ${diag.data.workspace}`);
    console.log(`   ✅ Errors: ${d.errors} | Warnings: ${d.warnings} | Total: ${d.totalCount}`);
    if (d.diagnostics?.length > 0) {
      d.diagnostics.slice(0, 3).forEach(di => 
        console.log(`      [${di.severity === 1 ? 'ERROR' : 'WARN'}] L${di.range.start.line+1}: ${di.message.slice(0,100)}`)
      );
    } else {
      console.log('   ✅ File is clean — no diagnostics');
    }
  } else {
    console.log(`   ❌ Failed: ${JSON.stringify(diag).slice(0,200)}`);
  }

  // Test 2: References
  console.log('\n2. REFERENCES (REPO_ROOT in guard.ts)');
  const ref = await run('references', resolve(REPO, 'scripts/mcp/atomic-edit/guard.ts'), 'typescript', 45, 14);
  if (ref.ok && ref.data?.ok) {
    const r = ref.data.data;
    console.log(`   ✅ ${r.totalCount} references in ${r.filesCount} file(s)`);
  } else {
    console.log(`   ❌ Failed`);
  }

  // Test 3: Symbols
  console.log('\n3. SYMBOLS (founder.ts document structure)');
  const sym = await run('symbols', TEST_FILE, 'typescript');
  if (sym.ok && sym.data?.ok) {
    const s = sym.data.data;
    console.log(`   ✅ ${s.count} symbols found:`);
    s.symbols.forEach(sy => console.log(`      - ${sy.name} (kind:${sy.kind}) at line ${sy.line}`));
  } else {
    console.log(`   ❌ Failed`);
  }

  // Test 4: Hover
  console.log('\n4. HOVER (buildFounderBlock in founder.ts)');
  const hov = await run('hover', TEST_FILE, 'typescript', 68, 18);
  if (hov.ok && hov.data?.ok) {
    console.log(`   ✅ Hover info: ${(hov.data.data?.contents || '').slice(0, 150)}`);
  } else {
    console.log(`   ⚠️ Hover: ${hov.data?.error || 'timeout (first LSP startup)'}`);
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  VERIFICATION COMPLETE                          ║');
  console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(e => { console.error(e); process.exit(1); });
