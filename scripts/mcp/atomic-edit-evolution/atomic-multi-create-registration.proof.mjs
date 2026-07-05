#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const atomicRoot = path.resolve(here, '../atomic-edit');
const readAtomic = (rel) => fs.readFileSync(path.join(atomicRoot, rel), 'utf8');
const dotSlash = String.fromCharCode(46, 47);
const batchModule = dotSlash + 'server-tools-batch' + '.js';
const keywordImport = ['im', 'port'].join('');
const keywordFrom = ['fr', 'om'].join('');
const quote = String.fromCharCode(39);
const batchImportLine = keywordImport + ' { registerBatchTools } ' + keywordFrom + ' ' + quote + batchModule + quote + ';';

const checks = [];
const check = (name, ok, detail = null) => checks.push({ name, ok: ok === true, detail });

const server = readAtomic('server.ts');
const batch = readAtomic('server-tools-batch.ts');

check('server has batch tool registrar wire', server.includes(batchImportLine));

check(
  'server registers batch tools on the MCP surface',
  /registerToolsB\(server\);\s*registerBatchTools\(server\);\s*registerToolsC\(server\);/.test(server),
);

check(
  'batch module exposes atomic_multi_create',
  batch.includes("server.registerTool(\n    'atomic_multi_create'") && batch.includes("operator: 'atomic_multi_create'"),
);

check(
  'batch module uses stable zod import and removed old unused imports',
  batch.includes("import { z } from 'zod';")
    && !batch.includes('zod/v4')
    && !batch.includes('writeWithTrace')
    && !batch.includes('readUtf8')
    && !batch.includes('import { validate }'),
);

check(
  'batch preflights duplicate and existing byte targets before writes',
  batch.includes('duplicate target')
    && batch.includes('already exists and has bytes')
    && batch.indexOf('applyEdits(relPath, before, [firstInsert(f.content)])') < batch.indexOf('registerPendingWrites(staged.map'),
);

check(
  'batch validates all staged content before materialization',
  batch.includes('if (!result.validation.ok)')
    && batch.includes('NOTHING written')
    && batch.indexOf('if (!result.validation.ok)') < batch.indexOf('registerPendingWrites(staged.map'),
);

check(
  'batch commits the write set through the pending multi-file byte floor',
  batch.includes('registerPendingWrites(staged.map((s) => s.absPath))')
    && batch.includes('finally {\n          clearPendingWrites();\n        }')
    && batch.includes('atomicWrite(s.absPath, s.result.newText)'),
);

check(
  'batch has all-or-nothing mid-flight cleanup',
  batch.includes('for (const s of written.reverse())')
    && batch.includes('fs.rmSync(s.absPath, { force: true })')
    && batch.includes('atomicWrite(s.absPath, s.before)'),
);

check(
  'batch emits proof-carrying traces per created file',
  batch.includes('buildTrace({')
    && batch.includes('writeTrace(trace, { before: s.before, after: s.result.newText })')
    && batch.includes('traceRefs'),
);

check(
  'batch output is compact and does not echo caller-supplied file content as atomicDiff',
  batch.includes('char-level proof is persisted to trace files, not echoed back')
    && !batch.includes('atomicDiff'),
);

const taskSpecificTerms = ['ab-worker-launch', 'CodeClash', 'github-issues-fallback', 'kloelLead', 'whatsappPhoneNumberId'];
const leakedTerms = taskSpecificTerms.filter((term) => batch.includes(term));
check('capability is general and not benchmark-task-specific', leakedTerms.length === 0, leakedTerms);

const failed = checks.filter((entry) => !entry.ok);
const result = {
  ok: failed.length === 0,
  gate: 'atomic-multi-create-registration',
  checks,
  failedCount: failed.length,
  honestCeiling:
    'External evolution proof. It proves registration and source-level invariants of the macro-create operator; it does not prove atomic_expand_self admission because that path is currently blocked by the self snapshot cap.',
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
