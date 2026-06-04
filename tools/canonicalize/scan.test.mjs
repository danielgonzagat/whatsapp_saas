// Focused regression test for the canonicalization scanner.
//
// Proves the three scanner fixes (P1-9, P1-10, P2-10) by running scan.mjs
// NON-DESTRUCTIVELY into a temp CANON_OUT_DIR and asserting the regenerated
// docs reflect the broadened detectors. Pure read-only over the repo; writes
// only to a throwaway temp directory.
//
// Run: node --test tools/canonicalize/scan.test.mjs

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = join(HERE, 'scan.mjs');

let outDir;
let eventTaxonomy;
let vocabulary;
let capabilityMap;

before(() => {
  outDir = mkdtempSync(join(tmpdir(), 'canon-scan-test-'));
  // Run the scanner non-destructively into the temp dir (never touches docs/).
  execFileSync('node', [SCAN], {
    env: { ...process.env, CANON_OUT_DIR: outDir },
    stdio: 'pipe',
  });
  eventTaxonomy = readFileSync(join(outDir, 'EVENT_TAXONOMY.md'), 'utf8');
  vocabulary = readFileSync(join(outDir, 'CANONICAL_VOCABULARY.md'), 'utf8');
  capabilityMap = readFileSync(join(outDir, 'CAPABILITY_MAP.md'), 'utf8');
});

test('scanner produces non-empty in-scope docs', () => {
  assert.ok(eventTaxonomy.length > 0, 'EVENT_TAXONOMY non-empty');
  assert.ok(vocabulary.length > 0, 'CANONICAL_VOCABULARY non-empty');
  assert.ok(capabilityMap.length > 0, 'CAPABILITY_MAP non-empty');
});

test('P1-9: EVENT_TAXONOMY captures Spine eventName: \'…\' governed events', () => {
  // These are emitted via `spine.emit({ eventName: '…' })` / `safeEmit({ eventName: '…' })`,
  // which the old `.emit('literal')`-only regex MISSED entirely.
  for (const ev of [
    'commerce.cart.created',
    'commerce.payment.approved',
    'commerce.crm.stage_changed',
    'commerce.campaign.clicked',
    'cognition.belief_updated',
    'lineage.genesis',
  ]) {
    assert.ok(
      eventTaxonomy.includes(`\`${ev}\``),
      `expected governed event ${ev} in EVENT_TAXONOMY`,
    );
  }
});

test('P1-9: EVENT_TAXONOMY ingests the authoritative PCI.6 catalog', () => {
  // The spine-coverage-auditor EVENT_TO_TRANSITION map is the authoritative
  // catalog; catalog-only events (never emitted at a recognized call site) must
  // still surface, tagged `catalog`.
  assert.ok(
    /commerce\.whatsapp\.message_received[\s\S]*?catalog/.test(eventTaxonomy) ||
      eventTaxonomy.includes('catalog'),
    'expected at least one catalog-tagged event from the PCI.6 table',
  );
  assert.ok(
    eventTaxonomy.includes('`commerce.whatsapp.message_received`'),
    'expected catalog event commerce.whatsapp.message_received',
  );
});

test('P1-10: CANONICAL_VOCABULARY names the real canonical, not the phantom', () => {
  // Phantom `MessageDispatchService` (zero `class MessageDispatchService` in repo)
  // must be gone; the real `ChannelMessageDispatchService` must be present.
  assert.ok(
    !/\|\s*`MessageDispatchService`/.test(vocabulary),
    'phantom bare MessageDispatchService row must be removed',
  );
  assert.ok(
    vocabulary.includes('`ChannelMessageDispatchService`'),
    'real ChannelMessageDispatchService must be the canonical',
  );
  // Dead WahaService alias (class verified gone) must be dropped.
  assert.ok(
    !vocabulary.includes('WahaService'),
    'dead WahaService alias must be dropped',
  );
});

test('P2-10: CAPABILITY_MAP detects previously-missed real implementations', () => {
  // split_payment — calculateSplit at split.engine.ts:174 (was 0 impl).
  assert.ok(
    capabilityMap.includes('calculateSplit'),
    'split_payment must detect calculateSplit',
  );
  // verify_webhook_signature — MercadoPago verifier (was 0 impl).
  assert.ok(
    capabilityMap.includes('MercadoPagoWebhookSignatureVerifier'),
    'verify_webhook_signature must detect MercadoPagoWebhookSignatureVerifier',
  );
  // parse_webhook — webhook controllers (was 0 impl).
  assert.ok(
    capabilityMap.includes('PaymentWebhookStripeController') ||
      capabilityMap.includes('TikTokWebhookController'),
    'parse_webhook must detect a webhook controller',
  );
  // qualify_contact — NeuroCrmService (was 0 impl).
  assert.ok(
    capabilityMap.includes('NeuroCrmService'),
    'qualify_contact must detect NeuroCrmService',
  );
  // None of these four capabilities should still report the misleading
  // "not implemented" marker.
  for (const cap of ['split_payment', 'verify_webhook_signature', 'parse_webhook', 'qualify_contact']) {
    const section = capabilityMap.split(`CAPABILITY: \`${cap}\``)[1] ?? '';
    const header = section.split('\n')[0] ?? '';
    assert.ok(
      !header.includes('not implemented'),
      `${cap} must no longer be flagged as not implemented`,
    );
  }
});

test.after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});
