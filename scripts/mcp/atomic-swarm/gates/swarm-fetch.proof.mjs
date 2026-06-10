#!/usr/bin/env node
// Gate: swarm_fetch — receipt integrity + fail-closed policy.
// Runs entirely against a local HTTP fixture (no external network needed).
import http from 'node:http';
import crypto from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, `.proof-swarm-fetch-${process.pid}`);
fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.mkdirSync(fixtureRoot, { recursive: true });
process.env.ATOMIC_SWARM_REPO_ROOT = fixtureRoot;

const { swarmFetch } = await import(`../swarm-fetch.mjs?proof=${Date.now()}`);

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

const BODY = 'atomic-swarm fetch proof body: ' + 'x'.repeat(512);
const BODY_SHA = crypto.createHash('sha256').update(Buffer.from(BODY, 'utf8')).digest('hex');

const server = http.createServer((req, res) => {
  if (req.url === '/redirect') {
    res.writeHead(302, { location: '/final' });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(BODY);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

try {
  // 1. happy path: body hash in the receipt matches the exact bytes served.
  const fetched = await swarmFetch({ url: `${base}/final` });
  record(
    'receipt sha256 matches exact served bytes',
    fetched.ok === true && fetched.receipt.bodySha256 === BODY_SHA && fetched.bodyText === BODY,
    { receipt: fetched.receipt },
  );

  // 2. redirects are followed and the FINAL url is in the receipt.
  const redirected = await swarmFetch({ url: `${base}/redirect` });
  record(
    'redirect followed with final url recorded',
    redirected.receipt.finalUrl.endsWith('/final') && redirected.receipt.bodySha256 === BODY_SHA,
    { finalUrl: redirected.receipt.finalUrl },
  );

  // 3. ledger receives one record per fetch, carrying the same hash.
  const ledgerFile = path.join(fixtureRoot, '.atomic', 'swarm-fetch-ledger.jsonl');
  const ledgerLines = fs.readFileSync(ledgerFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  record(
    'append-only ledger carries the receipts',
    ledgerLines.length === 2 && ledgerLines.every((entry) => entry.bodySha256 === BODY_SHA),
    { ledgerCount: ledgerLines.length },
  );

  // 4. truncation is explicit, never silent.
  const truncated = await swarmFetch({ url: `${base}/final`, maxBytes: 16 });
  record(
    'body cap produces explicit truncated flag and exact byte count',
    truncated.receipt.truncated === true && truncated.receipt.bytes === 16,
    { receipt: truncated.receipt },
  );

  // 5-8. fail-closed policy refusals.
  const refusals = [
    ['non-http protocol refused', { url: 'ftp://example.com/x' }],
    ['credentialed URL refused', { url: `http://user:pass@127.0.0.1:${port}/final` }],
    ['non-read method refused', { url: `${base}/final`, method: 'POST' }],
    ['authorization header refused', { url: `${base}/final`, headers: { Authorization: 'Bearer x' } }],
  ];
  for (const [name, args] of refusals) {
    let refused = false;
    let message = '';
    try {
      await swarmFetch(args);
    } catch (error) {
      refused = error?.swarmRefusal === true;
      message = String(error?.message ?? error);
    }
    record(name, refused, { message });
  }
} finally {
  server.close();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
if (jsonMode) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed, results }, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
process.exit(failed.length > 0 ? 1 : 0);
