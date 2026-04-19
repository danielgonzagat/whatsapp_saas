#!/usr/bin/env node

console.error(
  [
    '[codacy-noise] BLOCKED.',
    'The old "noise disable" flow is permanently disabled in this repository.',
    'Codacy now runs under MAX-RIGOR LOCK:',
    '- no pattern disables',
    '- no coding-standard draft relaxations',
    '- no suppression-by-comment workaround',
    '',
    'Allowed commands:',
    '- npm run codacy:sync',
    '- npm run codacy:check-max-rigor',
    '- npm run codacy:enforce-max-rigor',
  ].join('\n'),
);

process.exit(1);
