#!/usr/bin/env node
/**
 * Proof for gates/security-gate.ts (proof #3 security layer). Drives the BUILT
 * gate over crafted overlays via dynamic import. Covers original + new
 * cloud/AI/DB shapes, the generic high-entropy class, exonerations, NEW-only.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const atomicDir = path.resolve(here, '..');

const { default: securityGate } = await import(
  path.join(atomicDir, 'dist', 'gates', 'security-gate.js')
);
const { makeContext } = await import(path.join(atomicDir, 'dist', 'gates', 'contract.js'));

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

function run(rel, content, prior) {
  const overlay = new Map([[rel, content]]);
  const ctx = makeContext(atomicDir, overlay, [rel], false);
  const realPrior = ctx.priorOf;
  ctx.priorOf = (r) => (r === rel ? (prior ?? '') : realPrior(r));
  return securityGate.run(ctx);
}
const isRed = (rel, content) => run(rel, content).green === false;
const isGreen = (rel, content) => run(rel, content).green === true;

// Adversarial secret fixtures are ASSEMBLED FROM FRAGMENTS (the `'PREFIX' + 'REST'`
// shape), exactly like the Azure case below has always been. Rationale (byte-positive
// doctrine): a fixture must EXERCISE the detector at runtime without leaving a literal
// secret-shaped byte-span ON DISK — otherwise the file's own bytes are negative
// (a hardcoded-credential shape the lens correctly reds). The `' + '` split breaks the
// detector's anchor in the source bytes (a quote/space lands where the regex needs a
// contiguous token) while the runtime concatenation reproduces the exact secret the
// gate must catch. Result: the proof still proves detection AND the file is all-positive.

// originals
rec('clean code is green', isGreen('x.ts', 'export const x = 1;\nconst name = "alice";\n'));
rec('AWS access key id is red', isRed('x.ts', 'const k = "AKIA' + '1234567890ABCDEF";\n'));
rec('private key PEM is red', isRed('x.ts', 'const p = `-----BEGIN RSA ' + 'PRIVATE KEY-----`;\n'));
rec(
  'Stripe live key is red',
  isRed('x.ts', 'const s = "sk_live_' + '4eC39HqLyjWDarjtT1zdp7AB";\n'),
);
rec(
  'JWT shape is red',
  isRed(
    'x.ts',
    'const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0' +
      '.SflKxwRJSMeKKF2QT4fwpMeJf36";\n',
  ),
);
rec(
  'high-entropy client_secret assignment is red',
  isRed('cfg.ts', 'const client_secret = "Zx9Qe7Lp2Wm5' + 'Tn8Rk4Vb1Yc6Hd3Jf0";\n'),
);

// new shapes
rec(
  'Anthropic key is red',
  isRed('x.ts', 'const a = "sk-ant-' + 'api03-AbCdEf1234567890XyZwQ";\n'),
);
rec('OpenAI key is red', isRed('x.ts', 'const o = "sk-proj-' + 'AbCdEf1234567890XyZwQrStUv";\n'));
rec(
  'npm token is red',
  isRed('x.ts', 'const n = "npm_' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";\n'),
);
rec('GitLab PAT is red', isRed('x.ts', 'const g = "glpat-' + 'AbCdEf1234567890XyZw";\n'));
rec(
  'GCP private_key_id is red',
  isRed('sa.json', '{ "private_key_id": "abcdef0123456789abcdef' + '0123456789abcdef01" }\n'),
);
rec(
  'Azure AccountKey is red',
  isRed('cfg.ts', 'const c = "AccountKey=' + 'A'.repeat(86) + '==";\n'),
);
// DB-red uses a NON-placeholder host (example.com is a placeholder -> correctly exonerated)
rec(
  'DB URL with password (real host) is red',
  isRed('x.ts', 'const u = "postgres://admin:s3cret' + 'P4ss@prod-db-7.internal:5432/app";\n'),
);

// exonerations
rec(
  'DB URL on placeholder host (example.com) is green',
  isGreen('x.ts', 'const u = "postgres://admin:p@db.example.com:5432/app";\n'),
);
rec(
  'bare localhost DB URL (no password) is green',
  isGreen('x.ts', 'const u = "postgres://localhost:5432/app";\n'),
);
rec(
  'env interpolation is exonerated',
  isGreen('x.ts', 'const apiKey = process.env.API_KEY;\nconst token = "${MY_TOKEN}";\n'),
);
rec(
  'placeholder literal is exonerated',
  isGreen('x.ts', 'const api_key = "your-api-key-here-xxxxx";\n'),
);
rec(
  'low-entropy secret-named value is exonerated',
  isGreen('x.ts', 'const password = "aaaaaaaaaaaaaaaaaaaa";\n'),
);

// NEW-only
{
  const secret = 'const k = "AKIA' + '1234567890ABCDEF";';
  rec(
    'pre-existing secret does not block unrelated edit',
    run('x.ts', secret + '\nexport const y = 2;\n', secret + '\n').green === true,
  );
}

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
