#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const frontendTargets = [
  'src/app/(checkout)/components/CheckoutShell.tsx',
  'src/app/(checkout)/components/CheckoutPaymentSection.tsx',
  'src/components/kloel/landing/Reveal.tsx',
  'src/components/kloel/landing/LivePulse.tsx',
  'src/components/kloel/landing/FinalManifestLoop.tsx',
  'src/components/kloel/landing/HeroLoop.tsx',
  'src/components/kloel/landing/MultiChannel.tsx',
  'src/components/kloel/landing/ThanosSection.tsx',
  'src/components/kloel/graph/KloelGraphShell.tsx',
  'src/components/kloel/produtos/ProdutosAfiliarSeTab.tsx',
];

function run(label, cwd, args) {
  process.stdout.write(`[pr488-seatbelt-smoke] ${label}
`);
  execFileSync('npm', args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
}

run('frontend eslint targets', path.join(repoRoot, 'frontend'), [
  'exec',
  'eslint',
  '--',
  ...frontendTargets,
]);
run('worker eslint target', path.join(repoRoot, 'worker'), [
  'exec',
  'eslint',
  '--',
  'processors/autopilot/cia-action.ts',
]);

process.stdout.write('[pr488-seatbelt-smoke] OK\n');
