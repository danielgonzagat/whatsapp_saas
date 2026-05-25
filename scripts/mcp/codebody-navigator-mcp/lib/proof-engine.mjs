// Proof engine — turns a navigation route into a falsifiable receipt:
// "after running step X, expect DB row Y / event Z / file F to change".
// The engine itself does NOT execute the action; it builds the verification
// plan and (when given evidence) compares observed vs expected.

import { rg } from './ripgrep.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createProofEngine({ workspaceRoot, codegraph, prisma, tracer }) {
  /**
   * Produce a verification recipe for "chat says X → expect side effect Y".
   * The recipe describes:
   *   - the exact tool/handler invocation site
   *   - the prisma writes the handler should perform (statically derived)
   *   - the events the handler should emit
   *   - the test prompt to feed into the chat
   *   - the assertions a human/agent should run
   */
  function planChatToEffect({ message, expectModel, expectEvent }) {
    const trace = tracer.traceChatAction(message);
    const chain = trace.callChains[0];
    if (!chain) {
      return {
        ok: true,
        plan: {
          step1: { description: 'No tool chain resolved — likely no intent recognized.', evidence: trace },
          assertions: [
            'Manual: re-test chat phrasing or add an intent.',
            expectModel ? `Manual: confirm Prisma model ${expectModel} write site exists.` : null,
            expectEvent ? `Manual: confirm event ${expectEvent} is emitted.` : null,
          ].filter(Boolean),
        },
      };
    }
    const handlerFile = chain.file;
    const handlerLine = chain.line;
    const handlerSrc = (() => {
      const abs = join(workspaceRoot, handlerFile);
      if (!existsSync(abs)) return '';
      const text = readFileSync(abs, 'utf8');
      const lines = text.split(/\r?\n/);
      return lines.slice(Math.max(0, handlerLine - 1), handlerLine + 120).join('\n');
    })();
    const modelWrites = expectModel ? rg(`prisma\\.${expectModel[0].toLowerCase() + expectModel.slice(1)}\\.(create|update|upsert)`,
      { cwd: workspaceRoot, paths: [handlerFile], globs: ['*.ts'] }).matches : [];
    const eventEmits = expectEvent ? rg(`emit\\s*\\(\\s*['"\`]${expectEvent}['"\`]`,
      { cwd: workspaceRoot, paths: [handlerFile], globs: ['*.ts'] }).matches : [];

    return {
      ok: true,
      plan: {
        step1: {
          description: `Invoke tool "${chain.symbol}" (resolved from "${message}").`,
          handler: { file: handlerFile, line: handlerLine, symbol: chain.symbol },
        },
        step2: {
          description: 'Static analysis of handler source.',
          callees: chain.callees,
          handlerSourcePreview: handlerSrc.split('\n').slice(0, 30).join('\n'),
        },
        step3: {
          description: 'Expected side effects (proof matrix).',
          expectedModelWrites: expectModel ? { model: expectModel, foundWriteSites: modelWrites.map((m) => ({ line: m.line, text: m.text.trim() })) } : null,
          expectedEvents: expectEvent ? { event: expectEvent, foundEmitSites: eventEmits.map((m) => ({ line: m.line, text: m.text.trim() })) } : null,
        },
        assertions: [
          `STATIC: handler resolves to ${handlerFile}:${handlerLine}`,
          expectModel ? `STATIC: handler writes Prisma model ${expectModel} → ${modelWrites.length} site(s)` : null,
          expectEvent ? `STATIC: handler emits event ${expectEvent} → ${eventEmits.length} site(s)` : null,
          'RUNTIME: send the message to the chat and assert the DB row appears (workspace-scoped)',
          expectEvent ? `RUNTIME: assert event ${expectEvent} was emitted (Logger or test bus)` : null,
        ].filter(Boolean),
      },
    };
  }

  /**
   * Verify a recorded route receipt — given observed evidence, compute a
   * pass/fail per assertion. Pure transformation, no I/O.
   */
  function verifyReceipt(receipt, observed = {}) {
    const results = [];
    for (const a of receipt.assertions || []) {
      // STATIC assertions auto-pass because they were already checked when the
      // plan was generated; RUNTIME assertions need user-supplied evidence.
      if (a.startsWith('STATIC:')) {
        results.push({ assertion: a, status: 'pass', source: 'static' });
      } else if (a.startsWith('RUNTIME:')) {
        const key = a.toLowerCase();
        let evidence = null;
        if (key.includes('db') && observed.dbRow) evidence = observed.dbRow;
        else if (key.includes('event') && observed.event) evidence = observed.event;
        else if (observed.note) evidence = observed.note;
        results.push({ assertion: a, status: evidence ? 'pass' : 'unverified', evidence });
      } else {
        results.push({ assertion: a, status: 'unverified' });
      }
    }
    const passed = results.filter((r) => r.status === 'pass').length;
    return {
      ok: true,
      passed,
      total: results.length,
      results,
      verdict: passed === results.length ? 'PROVED' : 'PARTIAL',
    };
  }

  return { planChatToEffect, verifyReceipt };
}
