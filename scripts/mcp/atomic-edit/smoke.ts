/**
 * Smoke test — driver. The actual test bodies live in smoke-part-*.ts
 * sibling files. Run: npx tsx scripts/mcp/atomic-edit/smoke.ts.
 * Exit 0 = all assertions + live MCP round-trip passed; non-zero = failure.
 */

import { state } from './smoke-state.js';
import { partA } from './smoke-part-a.js';
import { partB } from './smoke-part-b.js';
import { partC } from './smoke-part-c.js';
import { partD } from './smoke-part-d.js';
import { partE, partF } from './smoke-part-ef.js';
import { partG, partH } from './smoke-part-gh.js';

(async () => {
  await partA();
  await partB();
  await partC();
  await partD();
  partE();
  partF();
  partG();
  partH();
  process.stdout.write(`\n${state.passed} passed, ${state.failed} failed\n`);
  process.exit(state.failed === 0 ? 0 : 1);
})().catch((e) => {
  process.stderr.write(`SMOKE CRASH: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(2);
});
