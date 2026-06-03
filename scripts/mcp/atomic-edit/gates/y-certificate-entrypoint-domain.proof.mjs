#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(sourceDir, rel), 'utf8');
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function main() {
  const results = [];
  const serverToolsY = read('server-tools-y.ts');
  const compiledProof = read('gates/compiled-mcp-y-certificate.proof.mjs');
  const wholeHostProof = read('gates/whole-host-y-certificate.proof.mjs');

  record(
    results,
    'atomic_y_certificate exposes codexEntrypointContract as a first-class domain',
    serverToolsY.includes("domain: 'codexEntrypointContract'") &&
      serverToolsY.includes("runJsonScript('gates/codex-entrypoint-contract.proof.mjs'") &&
      serverToolsY.includes('codexEntrypointGreen ?') &&
      serverToolsY.includes('Repair Codex config, workspace hook chain, no-bypass proof, or host launcher contract'),
    {
      hasDomain: serverToolsY.includes("domain: 'codexEntrypointContract'"),
      runsProof: serverToolsY.includes("runJsonScript('gates/codex-entrypoint-contract.proof.mjs'"),
      greenStatus: serverToolsY.includes('codexEntrypointGreen ?'),
    },
  );

  record(
    results,
    'compiled MCP certificate proof requires certificate codexEntrypointContract GREEN',
    compiledProof.includes("domain(cert, 'codexEntrypointContract')") &&
      compiledProof.includes('certificateEntrypointGreen') &&
      /completeState[\s\S]*certificateEntrypointGreen/.test(compiledProof) &&
      /honestBlockedState[\s\S]*certificateEntrypointGreen/.test(compiledProof),
    {
      readsDomain: compiledProof.includes("domain(cert, 'codexEntrypointContract')"),
      assertsGreen: compiledProof.includes('certificateEntrypointGreen'),
    },
  );

  record(
    results,
    'whole-host certificate proof requires certificate codexEntrypointContract GREEN',
    wholeHostProof.includes("entry.domain === 'codexEntrypointContract'") &&
      wholeHostProof.includes('certificateEntrypointGreen') &&
      /completeState[\s\S]*certificateEntrypointGreen/.test(wholeHostProof) &&
      /honestBlockedState[\s\S]*certificateEntrypointGreen/.test(wholeHostProof),
    {
      readsDomain: wholeHostProof.includes("entry.domain === 'codexEntrypointContract'"),
      assertsGreen: wholeHostProof.includes('certificateEntrypointGreen'),
    },
  );

  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
