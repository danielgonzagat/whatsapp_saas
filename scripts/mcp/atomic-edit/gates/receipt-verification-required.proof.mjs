#!/usr/bin/env node
/**
 * PROOF — receipt verification is REQUIRED for REAL/100 (unproven ≡ negative).
 *
 * Before this gate, truth_receipt sold REAL and zero_code_trust_score sold 100
 * on a SELF-REPORTED status alone (api/db/browser/external_provider/
 * manual_product_check with status:'passed' and no evidence). This proof drives
 * the REAL compiled pure helpers and asserts that a product-behavior claim is
 * only REAL / product-weighted when backed by VERIFIABLE evidence — an artifact
 * that exists on disk (runtime_probe additionally needs a gate-minted id, checked
 * in the handler). A self-report with no artifact is UNPROVEN and weight-capped.
 *
 * Falsifiable: drop the `verified` gate in classifyTruth (or the artifact cap in
 * verifiedEvidenceWeight) and the corresponding assertions flip and exit 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyTruth,
  artifactExists,
  productEvidenceVerified,
  hasVerifiedProductProof,
  verifiedEvidenceWeight,
  evidenceWeight,
} from '../dist/server-helpers-product-locks.js';

const jsonMode = process.argv.includes('--json');
const gatesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(gatesDir, '../../../..');

let failures = 0;
const results = [];
const expect = (cond, name) => {
  results.push({ name, ok: !!cond });
  if (!cond) failures++;
};

// fixtures: one real non-empty file, one empty file, one missing path
const realRel = `.receipt-proof-real-${process.pid}.txt`;
const emptyRel = `.receipt-proof-empty-${process.pid}.txt`;
const realAbs = path.join(repoRoot, realRel);
const emptyAbs = path.join(repoRoot, emptyRel);

try {
  fs.writeFileSync(realAbs, 'evidence bytes\n');
  fs.writeFileSync(emptyAbs, '');

  // ── artifactExists: only a real, non-empty, repo-contained file counts ──
  expect(artifactExists(undefined) === false, 'artifactExists(undefined) = false');
  expect(artifactExists([]) === false, 'artifactExists([]) = false');
  expect(artifactExists(['nope-does-not-exist.xyz']) === false, 'missing path = false');
  expect(artifactExists([emptyRel]) === false, 'empty file = false (a touch is not evidence)');
  expect(artifactExists([realRel]) === true, 'real non-empty file = true');

  // ── classifyTruth: REAL requires verified=true; unverified real-kind = UNPROVEN ──
  expect(
    classifyTruth('manual_product_check', 'passed', false, false) === 'UNPROVEN',
    'manual_product_check passed + UNVERIFIED -> UNPROVEN (forgery refused)',
  );
  expect(
    classifyTruth('manual_product_check', 'passed', false, true) === 'REAL',
    'manual_product_check passed + VERIFIED -> REAL',
  );
  expect(
    classifyTruth('db', 'passed', false, false) === 'UNPROVEN',
    'db passed + UNVERIFIED -> UNPROVEN',
  );
  expect(classifyTruth('db', 'passed', false, true) === 'REAL', 'db passed + VERIFIED -> REAL');
  expect(classifyTruth('stub', 'passed', false, true) === 'STUB', 'stub stays STUB');
  expect(classifyTruth('mock', 'passed', false, true) === 'MOCK_ONLY', 'mock stays MOCK_ONLY');
  expect(
    classifyTruth('unit_test', 'passed', false, false) === 'PARTIAL',
    'unit_test stays PARTIAL (not a real-kind)',
  );
  expect(
    classifyTruth('api', 'passed', true, true) === 'EXTERNAL_BLOCKED',
    'external blocker dominates',
  );

  // ── productEvidenceVerified / hasVerifiedProductProof ──
  expect(
    productEvidenceVerified('browser', 'passed', [realRel]) === true,
    'browser passed + artifact -> verified',
  );
  expect(
    productEvidenceVerified('browser', 'passed', undefined) === false,
    'browser passed + NO artifact -> not verified',
  );
  expect(
    hasVerifiedProductProof([{ kind: 'browser', status: 'passed' }]) === false,
    'no-artifact product evidence -> hasVerifiedProductProof false',
  );
  expect(
    hasVerifiedProductProof([
      { kind: 'browser', status: 'passed', artifactPaths: [realRel] },
    ]) === true,
    'artifact-backed product evidence -> hasVerifiedProductProof true',
  );

  // ── verifiedEvidenceWeight: unverified real-kind capped at 50; verified full ──
  expect(
    verifiedEvidenceWeight('browser', 'passed', undefined) === 50,
    'browser passed UNVERIFIED weight capped to 50 (was 85)',
  );
  expect(
    verifiedEvidenceWeight('browser', 'passed', [realRel]) === 85,
    'browser passed VERIFIED weight = 85',
  );
  expect(
    verifiedEvidenceWeight('manual_product_check', 'passed', undefined) === 50,
    'manual_product_check passed UNVERIFIED capped to 50 (was 100 — the 100 forgery)',
  );
  expect(
    verifiedEvidenceWeight('unit_test', 'passed', undefined) === evidenceWeight('unit_test', 'passed'),
    'non-real-kind weight unchanged (unit_test = 60)',
  );
} catch (error) {
  expect(false, `threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const p of [realAbs, emptyAbs]) {
    try { fs.unlinkSync(p); } catch { /* best-effort */ }
  }
}

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'receipt-verification-required', ok: failures === 0, results }));
} else {
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
