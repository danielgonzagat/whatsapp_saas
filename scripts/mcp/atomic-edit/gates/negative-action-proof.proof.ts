import { requireNegativeActionProof, removedByteCountBetween } from '../server-helpers-negative-proof.js';

interface ProofResult { name: string; ok: boolean; detail: string }
const results: ProofResult[] = [];
const check = (name: string, condition: boolean, detail = ''): void => {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
};
try {
  requireNegativeActionProof({ action: 'atomic_delete_file', target: 'x.ts', targetUnit: 'file', removedByteCount: 1, proofOfIncorrectness: 'too short' });
  check('short proof refused', false, 'accepted short proof');
} catch (e) {
  check('short proof refused', /proofOfIncorrectness/.test(String(e)), String(e));
}
try {
  requireNegativeActionProof({ action: 'atomic_delete_range', target: 'x.ts', targetUnit: 'range', removedByteCount: 0, proofOfIncorrectness: 'This range is a proven negative stale residue.' });
  check('empty byte effect refused', false, 'accepted empty byte effect');
} catch (e) {
  check('empty byte effect refused', /non-empty byte effect/.test(String(e)), String(e));
}
const admitted = requireNegativeActionProof({ action: 'atomic_remove_import', target: 'x.ts', targetUnit: 'import', removedByteCount: 7, proofOfIncorrectness: 'This import is unused residue proven by the caller.' });
check('valid proof admitted', admitted.verdict === 'NEGATIVE_BYTES_ADMITTED' && admitted.removedByteCount === 7, JSON.stringify(admitted));
check('proof hash persisted shape', /^[a-f0-9]{64}$/.test(admitted.proofSha256), admitted.proofSha256);
check(
  'removed byte count is byte-exact across utf8',
  removedByteCountBetween('aé🙂z', 'aZz') === Buffer.byteLength('é🙂', 'utf8'),
  String(removedByteCountBetween('aé🙂z', 'aZz')),
);
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail));
if (failed.length > 0) process.exit(1);
console.log(String(results.length) + ' passed, 0 failed');
