import { buildTrace } from '../trace.js';

interface ProofResult { name: string; ok: boolean; detail: string }
const results: ProofResult[] = [];
const check = (name: string, condition: boolean, detail = ''): void => {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
};

const trace = buildTrace({
  file: 'unicode.ts',
  operator: 'byte-effect-proof',
  before: 'aé🙂z',
  newText: 'aZz',
  inlinePreview: '',
  validation: { language: 'ts', before: 0, after: 0 },
  metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
});

check('before byte length is UTF-8 exact', trace.byteEffect.beforeBytes === Buffer.byteLength('aé🙂z', 'utf8'), JSON.stringify(trace.byteEffect));
check('proposed byte length is UTF-8 exact', trace.byteEffect.proposedBytes === Buffer.byteLength('aZz', 'utf8'), JSON.stringify(trace.byteEffect));
check('removed bytes are UTF-8 exact', trace.byteEffect.removedBytes === Buffer.byteLength('é🙂', 'utf8'), JSON.stringify(trace.byteEffect));
check('added bytes are UTF-8 exact', trace.byteEffect.addedBytes === Buffer.byteLength('Z', 'utf8'), JSON.stringify(trace.byteEffect));
check('metrics bytesNet defaults to byte net', trace.metrics.bytesNet === trace.byteEffect.netBytes, JSON.stringify(trace.metrics));

const previewTrace = buildTrace({
  file: 'preview.ts',
  operator: 'byte-effect-preview-proof',
  before: 'abc',
  newText: 'abç',
  inlinePreview: '',
  validation: { language: 'ts', before: 0, after: 0 },
  preview: true,
  changed: false,
});
check('preview currentAfterBytes stays before bytes', previewTrace.byteEffect.currentAfterBytes === Buffer.byteLength('abc', 'utf8'), JSON.stringify(previewTrace.byteEffect));
check('preview proposedBytes tracks proposed bytes', previewTrace.byteEffect.proposedBytes === Buffer.byteLength('abç', 'utf8'), JSON.stringify(previewTrace.byteEffect));

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail));
if (failed.length > 0) process.exit(1);
console.log(String(results.length) + ' passed, 0 failed');
