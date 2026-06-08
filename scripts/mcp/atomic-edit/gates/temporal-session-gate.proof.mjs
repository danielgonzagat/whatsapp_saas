#!/usr/bin/env node
const jsonMode = process.argv.includes('--json');
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }

const { judgeTemporalSession } = await import('../dist/gates/temporal-session-gate.js');
const helperImport = "import { helper } from '" + './helper' + "';\n";

const staleImportTimeline = [
  { name: 'begin', files: { 'src/flow.ts': 'export const value = 1;\n' } },
  { name: 'edit-1', files: { 'src/flow.ts': helperImport + 'export const value = 1;\n' } },
  { name: 'edit-2', files: { 'src/flow.ts': helperImport + 'export const value = 2;\n' } },
  { name: 'commit', files: { 'src/flow.ts': helperImport + 'export const value = 3;\n' } },
];
const stale = judgeTemporalSession(staleImportTimeline, { followingSnapshots: 2 });
record('temporal gate reds an import added and still unused after two following snapshots',
  stale.green === false &&
    stale.reds?.length === 1 &&
    stale.reds[0]?.file === 'src/flow.ts' &&
    stale.reds[0]?.importName === 'helper' &&
    /never referenced/i.test(stale.reds[0]?.fact ?? ''),
  stale);

const eventuallyUsedTimeline = [
  { name: 'begin', files: { 'src/flow.ts': 'export const value = 1;\n' } },
  { name: 'edit-1', files: { 'src/flow.ts': helperImport + 'export const value = 1;\n' } },
  { name: 'edit-2', files: { 'src/flow.ts': helperImport + 'export const value = helper();\n' } },
  { name: 'commit', files: { 'src/flow.ts': helperImport + 'export const value = helper();\n' } },
];
const used = judgeTemporalSession(eventuallyUsedTimeline, { followingSnapshots: 2 });
record('temporal gate stays green when the added import is used in a following snapshot', used.green === true && used.reds.length === 0, used);

const preExistingTimeline = [
  { name: 'begin', files: { 'src/flow.ts': helperImport + 'export const value = 1;\n' } },
  { name: 'edit-1', files: { 'src/flow.ts': helperImport + 'export const value = 2;\n' } },
  { name: 'edit-2', files: { 'src/flow.ts': helperImport + 'export const value = 3;\n' } },
  { name: 'commit', files: { 'src/flow.ts': helperImport + 'export const value = 4;\n' } },
];
const legacy = judgeTemporalSession(preExistingTimeline, { followingSnapshots: 2 });
record('temporal gate does not red pre-existing unused import debt as a new session fault', legacy.green === true && legacy.reds.length === 0, legacy);

const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
