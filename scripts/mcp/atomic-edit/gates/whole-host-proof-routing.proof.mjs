#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverToolsY = path.join(sourceDir, 'server-tools-y.ts');
const serverToolsSelf = path.join(sourceDir, 'server-tools-self.ts');
const ySource = fs.readFileSync(serverToolsY, 'utf8');
const selfSource = fs.readFileSync(serverToolsSelf, 'utf8');
const yBody = ySource.match(/function jsonScriptMustRunHostDirect\(name: string\): boolean \{[\s\S]*?\n\}/)?.[0] ?? '';
const selfBody = selfSource.match(/function selfExpansionProofMustRunHostDirect\(command: string\): boolean \{[\s\S]*?\n\}/)?.[0] ?? '';

const hostBoundaryScripts = [
  'mcp-launcher-host-boundary.proof.mjs',
  'codex-entrypoint-contract.proof.mjs',
  'whole-host-sandbox-launcher.proof.mjs',
];
const selfExpansionWholeHostScripts = [
  'whole-host-sandbox-launcher.proof.mjs',
  'whole-host-y-certificate.proof.mjs',
];

const results = [];
for (const name of hostBoundaryScripts) {
  const literal = `'gates/${name}'`;
  results.push({
    name: `Y certificate routes gates/${name} host-direct`,
    ok: yBody.includes(literal),
    detail: { literal, yBodyFound: Boolean(yBody) },
  });
}
for (const name of selfExpansionWholeHostScripts) {
  const literal = `'${name}'`;
  results.push({
    name: `self-expansion routes ${name} host-direct`,
    ok: selfBody.includes(literal),
    detail: { literal, selfBodyFound: Boolean(selfBody) },
  });
}

const payload = { ok: results.every((entry) => entry.ok), results };
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
