#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureEffectSnapshot, diffEffect, rollbackEffect } from '../dist/server-helpers-effect.js';

const jsonMode = process.argv.includes('--json');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(root, `.effect-metadata-mode-proof-${process.pid}-${Date.now()}`);

function modeOf(file) {
  return fs.statSync(file).mode & 0o7777;
}

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });
}

function cleanup() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function oneEffect(effects, file) {
  const effect = effects.find((entry) => entry.file === file);
  if (!effect) throw new Error(`missing effect for ${file}: ${JSON.stringify(effects)}`);
  return effect;
}

function runResult(name, fn) {
  try {
    const detail = fn();
    return { name, ok: true, detail };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const results = [];
try {
  results.push(
    runResult('diffEffect captures chmod-only metadata as a modified metadataOnly effect', () => {
      resetFixture();
      const file = path.join(fixtureRoot, 'mode.tmp');
      fs.writeFileSync(file, 'x');
      fs.chmodSync(file, 0o644);
      const snap = captureEffectSnapshot(fixtureRoot);
      fs.chmodSync(file, 0o755);
      const effect = oneEffect(diffEffect(snap), 'mode.tmp');
      if (effect.change !== 'modified') throw new Error(`expected modified, got ${effect.change}`);
      if (effect.metadataOnly !== true) throw new Error(`expected metadataOnly=true, got ${JSON.stringify(effect)}`);
      if (effect.modeBefore !== 0o644) throw new Error(`expected modeBefore 0644, got ${effect.modeBefore}`);
      if (effect.modeAfter !== 0o755) throw new Error(`expected modeAfter 0755, got ${effect.modeAfter}`);
      if (effect.bytesBefore !== 1 || effect.bytesAfter !== 1) throw new Error(`unexpected byte counts: ${JSON.stringify(effect)}`);
      if (effect.atomicDiff !== undefined) throw new Error('metadata-only effect must not emit a content diff');
      return effect;
    }),
  );

  results.push(
    runResult('rollbackEffect restores chmod-only mode changes', () => {
      resetFixture();
      const file = path.join(fixtureRoot, 'rollback.tmp');
      fs.writeFileSync(file, 'x');
      fs.chmodSync(file, 0o644);
      const snap = captureEffectSnapshot(fixtureRoot);
      fs.chmodSync(file, 0o755);
      const effects = diffEffect(snap);
      const restored = rollbackEffect(snap, effects);
      const finalMode = modeOf(file);
      const remaining = diffEffect(snap);
      if (restored !== 1) throw new Error(`expected restored=1, got ${restored}`);
      if (finalMode !== 0o644) throw new Error(`expected final mode 0644, got ${finalMode.toString(8)}`);
      if (remaining.length !== 0) throw new Error(`expected no remaining effect after rollback, got ${JSON.stringify(remaining)}`);
      return { restored, finalMode };
    }),
  );
} finally {
  cleanup();
}

const ok = results.every((result) => result.ok);
const payload = { ok, results };
process.stdout.write(JSON.stringify(payload, null, jsonMode ? 2 : 0) + '\n');
process.exit(ok ? 0 : 1);
