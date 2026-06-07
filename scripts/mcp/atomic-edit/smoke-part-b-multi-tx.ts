import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, type PartBCtx } from "./smoke-state.js";


export async function partBMultiTx(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    // ── Lever #3: multi-file atomic transaction ──
    const txA = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-tx-a.${process.pid}.ts`);
    const txB = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-tx-b.ts`);
    const txAAbs = path.join(repoRoot, txA);
    const txBAbs = path.join(repoRoot, txB);
    fs.writeFileSync(txAAbs, 'export const A = 1;\n');
    fs.writeFileSync(txBAbs, 'export const B = 2;\n');
    // happy path: both files changed atomically
    const txOk = (await client.callTool({
      name: 'atomic_transaction',
      arguments: {
        plan: [
          {
            file: txA,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '9' }],
          },
          {
            file: txB,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '8' }],
          },
        ],
        proofOfIncorrectness: 'smoke transaction fixture digits are stale negative data and may be replaced',
      },
    })) as { content: { text: string }[] };
    const txb = jsonBody(txOk);
    check(
      'transaction returns human summary first',
      txOk.content.length >= 2 && /Atomic transaction applied/.test(txOk.content[0]?.text ?? ''),
      txOk.content[0]?.text ?? '',
    );
    check(
      'transaction commits all files',
      txb.ok === true &&
        txb.transaction === true &&
        txb.filesWritten === 2 &&
        fs.readFileSync(txAAbs, 'utf8') === 'export const A = 9;\n' &&
        fs.readFileSync(txBAbs, 'utf8') === 'export const B = 8;\n',
      txOk.content[0].text,
    );
    // all-or-nothing: one file would regress → NOTHING written
    const txBad = (await client.callTool({
      name: 'atomic_transaction',
      arguments: {
        plan: [
          {
            file: txA,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '7' }],
          },
          {
            file: txB,
            edits: [
              { startLine: 1, startColumn: 14, endLine: 1, endColumn: 14, newText: ' = = {' },
            ],
          },
        ],
      },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'transaction all-or-nothing on regression',
      txBad.isError === true &&
        /transaction REFUSED/.test(txBad.content[0].text) &&
        fs.readFileSync(txAAbs, 'utf8') === 'export const A = 9;\n', // txA untouched
      txBad.content[0].text,
    );
    for (const f of [txAAbs, txBAbs]) if (fs.existsSync(f)) fs.unlinkSync(f);

    // analyzer transaction: ESLint proposes fixes in dry-run mode, atomic-edit writes them.
    const eslintRel = path.join('worker', `.smoke-eslint.${process.pid}.ts`);
    const eslintAbs = path.join(repoRoot, eslintRel);
    fs.writeFileSync(
      eslintAbs,
      'const envBackup = { TEST_FLAG: process.env.TEST_FLAG };\nexport function smoke(flag: boolean) {\n  if (flag) return 1;\n  return 0;\n}\n',
    );
    try {
      const eslintTx = (await client.callTool({
        name: 'atomic_apply_eslint_dry_run_fixes',
        arguments: {
          cwd: repoRoot,
          args: [eslintRel, '--fix-dry-run', '--format', 'json'],
          allowedPaths: [path.join(repoRoot, 'worker')],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const eslintBody = jsonBody(eslintTx) as {
        ok?: boolean;
        filesWritten?: number;
        traceRefs?: string[];
        filesTotal?: number;
        filesOmitted?: number;
        recommendedVerification?: string[];
        residueActionCandidates?: { symbol?: string; preferredAtomicAction?: string }[];
        residueActionCandidatesTotal?: number;
        summary?: string;
        summaryForHuman?: string;
      };
      const eslintAfter = fs.readFileSync(eslintAbs, 'utf8');
      check(
        'eslint dry-run fixes accept absolute cwd and allowedPaths',
        eslintBody.ok === true &&
          eslintBody.filesWritten === 1 &&
          eslintAfter.includes('if (flag) {') &&
          eslintAfter.includes('return 1;'),
        eslintTx.content[0]?.text ?? '',
      );
      check(
        'eslint analyzer recommends complete package proof',
        eslintBody.recommendedVerification?.includes('npm --prefix worker run build') === true &&
          eslintTx.content[0]?.text.includes('npm --prefix worker run build') === true,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer omits duplicate human summary from JSON',
        eslintBody.summary === undefined && eslintBody.summaryForHuman === undefined,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer reports compact file totals',
        eslintBody.filesTotal === 1 && eslintBody.filesOmitted === 0,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer reports residue action candidates',
        eslintBody.residueActionCandidatesTotal === 1 &&
          eslintBody.residueActionCandidates?.[0]?.symbol === 'envBackup' &&
          eslintBody.residueActionCandidates[0].preferredAtomicAction ===
            'use_existing_fixture_or_env_backup_with_atomic_replace_text',
        JSON.stringify(eslintBody),
      );
      const firstTrace = eslintBody.traceRefs?.[0];
      const traceAbs = firstTrace ? path.join(repoRoot, firstTrace) : '';
      const traceBody =
        traceAbs && fs.existsSync(traceAbs) ? JSON.parse(fs.readFileSync(traceAbs, 'utf8')) : {};
      check(
        'eslint analyzer trace records preservation topology',
        traceBody.targetUnit === 'eslint_dry_run_file_output' &&
          traceBody.semanticImpact === 'lint_fix_auto_applied' &&
          Array.isArray(traceBody.preservedZones) &&
          traceBody.preservedZones.length >= 2,
        JSON.stringify(traceBody),
      );

      const residueRel = path.join('worker', `.smoke-eslint-residue.${process.pid}.spec.ts`);
      const residueAbs = path.join(repoRoot, residueRel);
      fs.writeFileSync(
        residueAbs,
        [
          "import { describe, beforeEach, it, expect } from 'vitest';",
          '',
          'const envBackup = { ...process.env };',
          '',
          'function clearOpenAiEnvs() {',
          '  delete process.env.OPENAI_MODEL;',
          '}',
          '',
          "describe('openai-models', () => {",
          '  beforeEach(() => {',
          '    clearOpenAiEnvs();',
          '  });',
          '',
          "  describe('resolveWorkerOpenAIModel', () => {",
          "    it('uses env', () => {",
          "      process.env.OPENAI_MODEL = 'gpt-test';",
          "      expect(process.env.OPENAI_MODEL).toBe('gpt-test');",
          '    });',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      try {
        const residueTx = (await client.callTool({
          name: 'atomic_apply_eslint_dry_run_fixes',
          arguments: {
            cwd: repoRoot,
            args: [residueRel, '--fix-dry-run', '--format', 'json'],
            allowedPaths: [path.join(repoRoot, 'worker')],
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const residueSummary = residueTx.content[0]?.text ?? '';
        const residueBody =
          residueTx.content.length > 1
            ? (jsonBody(residueTx) as {
                ok?: boolean;
                knownResidueFixesAppliedTotal?: number;
              })
            : undefined;
        const residueAfter = fs.readFileSync(residueAbs, 'utf8');
        check(
          'eslint analyzer applies known env residue fix',
          ((residueBody?.ok === true && residueBody.knownResidueFixesAppliedTotal === 1) ||
            (/Known residue fixes applied: 1/.test(residueSummary) &&
              residueTx.content.length === 1)) &&
            residueAfter.includes('afterEach') &&
            residueAfter.includes('process.env = { ...envBackup }') &&
            !residueAfter.includes('Object.assign(process.env, envBackup)'),
          residueSummary,
        );
        check(
          'eslint analyzer omits machine JSON when residue fully resolved',
          residueTx.content.length === 1 &&
            /Unresolved residue after known fixes: 0/.test(residueSummary),
          JSON.stringify(residueTx.content),
        );
      } finally {
        if (fs.existsSync(residueAbs)) fs.unlinkSync(residueAbs);
      }
    } finally {
      if (fs.existsSync(eslintAbs)) fs.unlinkSync(eslintAbs);
    }
}
