import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, sha, type PartBCtx } from "./smoke-state.js";


export async function partBSetup(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
  const tools = await client.listTools();
  const names = tools.tools.map((t: { name: string }) => t.name).sort();
  const batchTool = tools.tools.find((tool: { name: string; description?: string }) =>
    tool.name === 'atomic_batch_replace_text',
  );
    check(
      'server lists the required Atomic tool surface (registry may grow monotonically)',
      names.length >= 86 &&
          names.includes('atomic_exec') &&
          names.includes('atomic_expand_self') &&
          names.includes('atomic_y_certificate') &&
          names.includes('atomic_host_reentry_receipt') &&
          names.includes('atomic_converge') &&
          names.includes('atomic_intent_converge') &&
          names.includes('atomic_rename_symbol_universal') &&
          names.includes('atomic_bypass_report') &&
          names.includes('atomic_replace_at') &&
          names.includes('atomic_locate') &&
          names.includes('atomic_grep') &&
          names.includes('atomic_glob') &&
          names.includes('atomic_outline') &&
        names.includes('atomic_lens') &&
        names.includes('atomic_read_file') &&
        names.includes('atomic_scan_bytes') &&
        names.includes('atomic_grep_calls') &&
        names.includes('atomic_repair_scope') &&
        names.includes('atomic_session_begin') &&
        names.includes('atomic_session_savepoint') &&
        names.includes('atomic_session_rollback') &&
        names.includes('atomic_session_commit') &&
        names.includes('atomic_workspace_bind') &&
        names.includes('atomic_workspace_status') &&
        names.includes('atomic_prove') &&
        names.includes('atomic_seal') &&
        names.includes('atomic_create_file') &&
        names.includes('atomic_delete_file') &&
        names.includes('atomic_positive_bytes_begin') &&
        names.includes('atomic_positive_bytes_append') &&
        names.includes('atomic_positive_bytes_commit') &&
        names.includes('atomic_positive_bytes_abort') &&
        names.includes('code_file_stat') &&
        names.includes('atomic_replace_text') &&
        names.includes('atomic_transaction') &&
        names.includes('atomic_apply_eslint_dry_run_fixes') &&
        names.includes('atomic_wrap_range') &&
        names.includes('code_outline') &&
        names.includes('atomic_edit_symbol') &&
        names.includes('atomic_add_import') &&
        names.includes('atomic_remove_import') &&
        names.includes('atomic_replace_property_value') &&
        names.includes('atomic_rename_property_key') &&
        names.includes('atomic_add_await_to_call') &&
        names.includes('atomic_insert_after_anchor') &&
        names.includes('atomic_insert_before_anchor') &&
        names.includes('atomic_replace_between_anchors') &&
        names.includes('atomic_replace_text_in_anchor_region') &&
        names.includes('product_intent_contract') &&
        names.includes('zero_code_trust_score') &&
        names.includes('behavior_receipt') &&
        names.includes('truth_receipt') &&
        names.includes('continuity_status') &&
        names.includes('atomic_lock_acquire') &&
        names.includes('atomic_lock_status') &&
        names.includes('atomic_lock_release') &&
        names.includes('atomic_edit') &&
        names.includes('code_outline_batch') &&
        names.includes('code_readcode_batch') &&
        names.includes('code_read_symbols_batch') &&
        names.includes('atomic_batch_replace_text'),
      names.join(','),
    );

    check(
      'atomic_batch_replace_text advertises macro fast path and intent-derived proof',
      typeof batchTool?.description === 'string' &&
        /one coherent intent/i.test(batchTool.description) &&
        /serial micro-edits/i.test(batchTool.description) &&
        /auto-derives/i.test(batchTool.description),
      batchTool?.description ?? 'missing atomic_batch_replace_text descriptor',
    );

    const batchReadRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-read-symbols-batch.${process.pid}.ts`);
    const batchReadAbs = path.join(repoRoot, batchReadRel);
    const batchReadSource = [
      'export function alphaSymbol(input: number): number {',
      '  return input + 1;',
      '}',
      '',
      'export function betaSymbol(input: string): string {',
      '  return input.toUpperCase();',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(batchReadAbs, batchReadSource);
    const batchNextDirRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-readcode-batch-next.${process.pid}`,
    );
    const batchNextDirAbs = path.join(repoRoot, batchNextDirRel);
    fs.mkdirSync(batchNextDirAbs, { recursive: true });
    fs.writeFileSync(path.join(batchNextDirAbs, 'first.ts'), 'export const first = 1;\n');
    fs.writeFileSync(path.join(batchNextDirAbs, 'second.ts'), 'export const second = 2;\n');
    try {
      const directoryRead = (await client.callTool({
        name: 'code_readcode',
        arguments: { path: batchNextDirRel },
      })) as { content: { text: string }[]; isError?: boolean };
      const directoryReadBody = jsonBody(directoryRead);
      check(
        'code_readcode directory response advertises ready code_readcode_batch next call',
        directoryRead.isError !== true &&
          directoryReadBody.ok === true &&
          directoryReadBody.mode === 'directory' &&
          directoryReadBody.batchNext?.tool === 'code_readcode_batch' &&
          directoryReadBody.batchNext?.items?.some(
            (entry: { path?: string }) => entry.path === path.join(batchNextDirRel, 'first.ts'),
          ) &&
          directoryReadBody.batchNext?.items?.some(
            (entry: { path?: string }) => entry.path === path.join(batchNextDirRel, 'second.ts'),
          ),
        directoryRead.content.map((p) => p.text).join('\n'),
      );
      const batchRead = (await client.callTool({
        name: 'code_read_symbols_batch',
        arguments: {
          items: [
            { path: batchReadRel, selector: 'alphaSymbol' },
            { path: batchReadRel, selector: 'betaSymbol' },
          ],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const batchReadBody = jsonBody(batchRead);
      const alphaRead = batchReadBody.results?.find(
        (entry: { resolvedSelector?: string }) => entry.resolvedSelector === 'alphaSymbol',
      );
      const betaRead = batchReadBody.results?.find(
        (entry: { resolvedSelector?: string }) => entry.resolvedSelector === 'betaSymbol',
      );
      check(
        'code_read_symbols_batch reads clustered known symbols in one compact call',
        batchRead.isError !== true &&
          batchReadBody.ok === true &&
          batchReadBody.mode === 'symbols-batch' &&
          batchReadBody.requested === 2 &&
          batchReadBody.returned === 2 &&
          batchReadBody.failed === 0 &&
          alphaRead?.fileSha256 === sha(batchReadSource) &&
          betaRead?.fileSha256 === sha(batchReadSource) &&
          alphaRead?.code?.includes('return input + 1') &&
          !alphaRead?.code?.includes('betaSymbol') &&
          betaRead?.code?.includes('return input.toUpperCase()') &&
          !betaRead?.code?.includes('alphaSymbol') &&
          !('content' in batchReadBody),
        batchRead.content.map((p) => p.text).join('\n'),
      );
      const adaptiveBatchRead = (await client.callTool({
        name: 'code_readcode_batch',
        arguments: {
          items: [
            { path: batchReadRel },
            { path: batchReadRel, selector: 'betaSymbol' },
          ],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const adaptiveBatchReadBody = jsonBody(adaptiveBatchRead);
      const fullRead = adaptiveBatchReadBody.results?.find(
        (entry: { mode?: string }) => entry.mode === 'full',
      );
      const symbolRead = adaptiveBatchReadBody.results?.find(
        (entry: { mode?: string; resolvedSelector?: string }) =>
          entry.mode === 'symbol' && entry.resolvedSelector === 'betaSymbol',
      );
      check(
        'code_readcode_batch reads clustered mixed file/symbol context in one adaptive call',
        adaptiveBatchRead.isError !== true &&
          adaptiveBatchReadBody.ok === true &&
          adaptiveBatchReadBody.mode === 'readcode-batch' &&
          adaptiveBatchReadBody.requested === 2 &&
          adaptiveBatchReadBody.returned === 2 &&
          adaptiveBatchReadBody.failed === 0 &&
          fullRead?.content === batchReadSource &&
          fullRead?.fileSha256 === sha(batchReadSource) &&
          fullRead?.symbols?.some((entry: { selector?: string }) => entry.selector === 'alphaSymbol') &&
          symbolRead?.code?.includes('return input.toUpperCase()') &&
          !symbolRead?.code?.includes('alphaSymbol') &&
          !('content' in adaptiveBatchReadBody),
        adaptiveBatchRead.content.map((p) => p.text).join('\n'),
      );
    } finally {
      if (fs.existsSync(batchReadAbs)) fs.unlinkSync(batchReadAbs);
      fs.rmSync(batchNextDirAbs, { recursive: true, force: true });
    }

    const scanRel = path.join('scripts', 'mcp', 'atomic-edit', 'server.ts');
    const scanSource = fs.readFileSync(path.join(repoRoot, scanRel), 'utf8');
    const scan = (await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: scanRel, maxFiles: 5, maxEvidencePerFile: 3 },
    })) as { content: { text: string }[]; isError?: boolean };
    const scanBody = jsonBody(scan);
    const scanFile = scanBody.files?.find((entry: { file?: string }) => entry.file === scanRel);
    check(
      'atomic_scan_bytes summarizes reachable source as positive within declared battery',
      scan.isError !== true &&
        scanBody.ok === true &&
        scanBody.sourceFilesRead === 1 &&
        scanBody.totals?.positiveFiles === 1 &&
        scanBody.totals?.negativeFiles === 0 &&
        scanFile?.sha256 === sha(scanSource) &&
        scanFile?.verdict === 'POSITIVE_WITHIN_DECLARED_BATTERY' &&
        scanFile?.negativeByteEvidenceCount === 0,
      scan.content[0]?.text ?? '',
    );

    const scanFiltered = (await client.callTool({
      name: 'atomic_scan_bytes',
      arguments: { scope: scanRel, includePositiveFiles: false, maxFiles: 5 },
    })) as { content: { text: string }[]; isError?: boolean };
    const scanFilteredBody = jsonBody(scanFiltered);
    check(
      'atomic_scan_bytes can omit clean positives while keeping totals',
      scanFiltered.isError !== true &&
        scanFilteredBody.ok === true &&
        scanFilteredBody.files?.length === 0 &&
        scanFilteredBody.omittedPositiveFiles === 1 &&
        scanFilteredBody.totals?.positiveFiles === 1 &&
        scanFilteredBody.totals?.negativeFiles === 0,
      scanFiltered.content[0]?.text ?? '',
    );

    const scanMdRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-scan-notes.${process.pid}.opaque`);
    const scanMdAbs = path.join(repoRoot, scanMdRel);
    const scanMdSource = 'Atomic scan smoke\nOutside every declared direct-file battery.\n';
    fs.writeFileSync(scanMdAbs, scanMdSource);
    try {
      const scanUnjudged = (await client.callTool({
        name: 'atomic_scan_bytes',
        arguments: { scope: scanMdRel, maxFiles: 5, maxEvidencePerFile: 5 },
      })) as { content: { text: string }[]; isError?: boolean };
      const scanUnjudgedBody = jsonBody(scanUnjudged);
      const scanUnjudgedFile = scanUnjudgedBody.files?.find((entry: { file?: string }) => entry.file === scanMdRel);
      check(
        'atomic_scan_bytes keeps direct non-source files as explicit proof debt',
        scanUnjudged.isError !== true &&
          scanUnjudgedBody.ok === true &&
          scanUnjudgedBody.unjudgedFilesRead === 1 &&
          scanUnjudgedBody.totals?.proofDebtFiles === 1 &&
          scanUnjudgedBody.totals?.unjudgedFiles === 1 &&
          scanUnjudgedFile?.sha256 === sha(scanMdSource) &&
          scanUnjudgedFile?.verdict === 'UNJUDGED' &&
          scanUnjudgedFile?.sourceLensApplied === false &&
          scanUnjudgedFile?.proofDebt?.some((debt: string) => /no declared source-language battery/i.test(debt)),
        scanUnjudged.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(scanMdAbs)) fs.unlinkSync(scanMdAbs);
    }

    const intent = (await client.callTool({
      name: 'product_intent_contract',
      arguments: { goal: 'fazer o chat do admin persistir mensagens em Postgres' },
    })) as { content: { text: string }[] };
    const intentBody = jsonBody(intent);
    check(
      'product intent maps chat persistence',
      intentBody.ok === true && intentBody.targetIntegration === 'chat_persistence',
      intent.content[0]?.text ?? '',
    );

    const intentConvergeRel = path.join('.atomic', 'generated-intent', `smoke-intent-converge-${process.pid}.test.ts`);
    const intentConvergeAbs = path.join(repoRoot, intentConvergeRel);
    if (fs.existsSync(intentConvergeAbs)) fs.unlinkSync(intentConvergeAbs);
    const intentConverge = (await client.callTool({
      name: 'atomic_intent_converge',
      arguments: {
        goal: 'fazer o chat do admin persistir mensagens em Postgres',
        outputFile: intentConvergeRel,
      },
    })) as { content: { text: string }[] };
    const intentConvergeBody = jsonBody(intentConverge);
    check(
      'intent converge generates a green product-contract preview without writing',
      intentConvergeBody.ok === true &&
        intentConvergeBody.targetIntegration === 'chat_persistence' &&
        intentConvergeBody.converged === true &&
        intentConvergeBody.committed === false &&
        intentConvergeBody.files?.[0]?.newText?.includes('atomicIntentContract') &&
        !fs.existsSync(intentConvergeAbs),
      intentConverge.content[0]?.text ?? '',
    );

    const zct = (await client.callTool({
      name: 'zero_code_trust_score',
      arguments: {
        evidence: [
          {
            kind: 'browser',
            status: 'passed',
            summary: 'user flow passed',
            artifactPaths: ['scripts/mcp/atomic-edit/README.md'],
          },
        ],
        founderCanValidateByProduct: true,
      },
    })) as { content: { text: string }[] };
    const zctBody = jsonBody(zct);
    check(
      'zero-code trust reaches 100 with product proof',
      zctBody.score === 100 && zctBody.verdict === 'PRODUCT_VALIDATABLE',
      zct.content[0]?.text ?? '',
    );

    const receipt = (await client.callTool({
      name: 'behavior_receipt',
      arguments: {
        productBehavior: 'Admin chat reloads persisted messages',
        validation: [
          {
            kind: 'api',
            status: 'passed',
            summary: 'messages returned',
            artifactPaths: ['scripts/mcp/atomic-edit/README.md'],
          },
        ],
        clickPath: ['Admin', 'Chat', 'Reload session'],
      },
    })) as { content: { text: string }[] };
    const receiptBody = jsonBody(receipt);
    check(
      'behavior receipt produces founder proof',
      receiptBody.zeroCodeTrust === 100 && receiptBody.productProof === true,
      receipt.content[0]?.text ?? '',
    );

    const truth = (await client.callTool({
      name: 'truth_receipt',
      arguments: {
        claims: [
          {
            claim: 'API persisted message',
            evidenceKind: 'db',
            status: 'passed',
            artifactPaths: ['scripts/mcp/atomic-edit/README.md'],
          },
          { claim: 'UI button is live', evidenceKind: 'stub', status: 'passed' },
        ],
      },
    })) as { content: { text: string }[] };
    const truthBody = jsonBody(truth);
    check(
      'truth receipt refuses stub as real',
      truthBody.claims?.[0]?.truth === 'REAL' && truthBody.claims?.[1]?.truth === 'STUB',
      truth.content[0]?.text ?? '',
    );

    const continuity = (await client.callTool({
      name: 'continuity_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const continuityBody = jsonBody(continuity);
    check(
      'continuity status reads repo state',
      continuityBody.ok === true && typeof continuityBody.nextAction === 'string',
      continuity.content[0]?.text ?? '',
    );

    const yCert = (await client.callTool({
      name: 'atomic_y_certificate',
      arguments: { scope: 'whole-host', includeAudits: false },
    }, undefined, { timeout: 120000 })) as { content: { text: string }[] };
    const yCertBody = jsonBody(yCert);
    const yDomains = Array.isArray(yCertBody.domains) ? yCertBody.domains : [];
    const yBlockers = Array.isArray(yCertBody.blockers) ? yCertBody.blockers : [];
    const yBlockerDomains = new Set(yBlockers.map((b: { domain?: string }) => b.domain).filter(Boolean));
    const yDomain = (domain: string): { domain?: string; status?: string } | undefined =>
      yDomains.find((entry: { domain?: string }) => entry.domain === domain);
    const yNonGreenDomains = yDomains.filter(
      (entry: { domain?: string; status?: string }) =>
        entry.domain && entry.status !== 'GREEN' && entry.domain !== 'certificateMandatoryDomainCoverage',
    );
    check(
      'Y certificate blocks whole-host universality for every non-green mandatory domain',
      yCertBody.ok === true &&
        yCertBody.yComplete === false &&
        yCertBody.verdict === 'Y_BLOCKED' &&
        yDomain('certificateMandatoryDomainCoverage')?.status === 'GREEN' &&
        yNonGreenDomains.length > 0 &&
        yNonGreenDomains.every((entry: { domain?: string }) => entry.domain && yBlockerDomains.has(entry.domain)),
      yCert.content.map((p) => p.text).join('\n'),
    );

    const selfDeniedRel = path.join('scripts', 'mcp', 'atomic-edit', `.self-expansion-denied.${process.pid}.ts`);
    const selfDeniedAbs = path.join(repoRoot, selfDeniedRel);
    const selfDenied = (await client.callTool({
      name: 'atomic_create_file',
      arguments: { file: selfDeniedRel, content: 'export const DENIED_SELF_EXPANSION = true;\n' },
    })) as { content: { text: string }[]; isError?: boolean };
    const selfDeniedText = selfDenied.content.map((p) => p.text).join('\n');
    check(
      'direct atomic self-expansion is refused outside atomic_expand_self',
      selfDenied.isError === true && /self-expansion admission/.test(selfDeniedText) && !fs.existsSync(selfDeniedAbs),
      selfDeniedText,
    );

    const selfAllowedRel = path.join('scripts', 'mcp', 'atomic-edit', `.self-expansion-allowed.${process.pid}.ts`);
    const selfAllowedAbs = path.join(repoRoot, selfAllowedRel);
    const selfAllowed = (await client.callTool({
      name: 'atomic_expand_self',
      arguments: {
        intent: 'smoke self-expansion admission with proof',
        files: [{ op: 'create', file: selfAllowedRel, content: 'export const SELF_EXPANSION_ALLOWED = true;\n' }],
        proofCommands: ['node build.mjs', 'node codex-atomic-only-hook.proof.mjs --json'],
      },
    }, undefined, { timeout: 240000 })) as { content: { text: string }[]; isError?: boolean };
    const selfAllowedBody = jsonBody(selfAllowed);
    check(
      'atomic_expand_self creates atomic source only after proofs pass',
      selfAllowed.isError !== true &&
        selfAllowedBody.ok === true &&
        selfAllowedBody.admission === 'self-expansion-validator-lattice-green-and-darwin-godel-promoted' &&
        typeof selfAllowedBody.selfEvolution?.promotionReceipt?.receiptSha256 === 'string' &&
        typeof selfAllowedBody.selfEvolution?.archive?.archiveEntrySha256 === 'string' &&
        fs.existsSync(selfAllowedAbs),
      selfAllowed.content.map((p) => p.text).join('\n'),
    );
    const selfCleanup = (await client.callTool({
      name: 'atomic_expand_self',
      arguments: {
        intent: 'smoke self-expansion cleanup of negative test byte',
        files: [
          {
            op: 'delete',
            file: selfAllowedRel,
            proofOfIncorrectness: 'temporary self-expansion smoke fixture, not production atomic behavior',
          },
        ],
        proofCommands: ['node build.mjs', 'node codex-atomic-only-hook.proof.mjs --json'],
      },
    }, undefined, { timeout: 240000 })) as { content: { text: string }[]; isError?: boolean };
    const selfCleanupBody = jsonBody(selfCleanup);
    check(
      'atomic_expand_self deletes only with explicit negative-byte proof',
      selfCleanup.isError !== true && selfCleanupBody.ok === true && !fs.existsSync(selfAllowedAbs),
      selfCleanup.content.map((p) => p.text).join('\n'),
    );

    const readOnlyExec = (await client.callTool({
      name: 'atomic_exec',
      arguments: {
        command: 'pwd',
        cwd: 'scripts/mcp/atomic-edit',
        intent: 'smoke read-only exec classification',
      },
    })) as { content: { text: string }[]; isError?: boolean };
    const readOnlyExecBody = jsonBody(readOnlyExec);
    check(
      'atomic_exec allows classified read-only command without effect proof',
      readOnlyExec.isError !== true &&
        readOnlyExecBody.ok === true &&
        readOnlyExecBody.atomicEnvelope?.effectProven === false &&
        readOnlyExecBody.commandClass === 'read-only',
      readOnlyExec.content.map((p) => p.text).join('\n'),
    );

    const execAutoFile = `smoke-exec-auto-${process.pid}.txt`;
    const execAutoAbs = path.join(repoRoot, 'scripts', 'mcp', 'atomic-edit', execAutoFile);
    try {
      const execAuto = (await client.callTool({
        name: 'atomic_exec',
        arguments: {
          command: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(execAutoFile)}, "AUTO")'`,
          cwd: 'scripts/mcp/atomic-edit',
          intent: 'smoke omitted proveEffect auto-proves mutable shell write',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const execAutoBody = jsonBody(execAuto);
      check(
        'atomic_exec auto-proves mutable-or-unknown command when proveEffect is omitted',
        execAuto.isError !== true &&
          execAutoBody.ok === true &&
          execAutoBody.commandClass === 'mutable-or-unknown' &&
          execAutoBody.atomicEnvelope?.effectProven === true &&
          execAutoBody.atomicEnvelope?.effectProofAuto === true &&
          execAutoBody.effect?.changedFiles === 1 &&
          execAutoBody.effect?.files?.[0]?.file === execAutoFile &&
          fs.existsSync(execAutoAbs),
        execAuto.content.map((p) => p.text).join('\n'),
      );
    } finally {
      if (fs.existsSync(execAutoAbs)) fs.unlinkSync(execAutoAbs);
    }

    const execFalseFile = `smoke-exec-explicit-false-${process.pid}.txt`;
    const execFalseAbs = path.join(repoRoot, 'scripts', 'mcp', 'atomic-edit', execFalseFile);
    try {
      const execFalse = (await client.callTool({
        name: 'atomic_exec',
        arguments: {
          command: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(execFalseFile)}, "FALSE")'`,
          cwd: 'scripts/mcp/atomic-edit',
          proveEffect: false,
          intent: 'smoke explicit false shell write must be refused',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const falseText = execFalse.content.map((p) => p.text).join('\n');
      check(
        'atomic_exec refuses mutable-or-unknown command with explicit proveEffect false',
        execFalse.isError === true &&
          /explicit proveEffect:false|effect proof required|mutable-or-unknown/i.test(falseText) &&
          !fs.existsSync(execFalseAbs),
        falseText,
      );
    } finally {
      if (fs.existsSync(execFalseAbs)) fs.unlinkSync(execFalseAbs);
    }

    const externalExec = (await client.callTool({
      name: 'atomic_exec',
      arguments: {
        command: 'curl --max-time 1 -X POST https://example.invalid/atomic-smoke',
        cwd: 'scripts/mcp/atomic-edit',
        proveEffect: true,
        timeoutMs: 1000,
        intent: 'smoke external effects must not be mistaken for filesystem proof',
      },
    })) as { content: { text: string }[]; isError?: boolean };
    const externalText = externalExec.content.map((p) => p.text).join('\n');
    check(
      'atomic_exec refuses external/host effect commands even with filesystem proof',
      externalExec.isError === true && /external-or-host-effect|external effect/i.test(externalText),
      externalText,
    );

    const execEffectRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-exec-effect.${process.pid}`);
    const execEffectAbs = path.join(repoRoot, execEffectRel);
    fs.rmSync(execEffectAbs, { recursive: true, force: true });
    fs.mkdirSync(execEffectAbs, { recursive: true });
    try {
      const execProven = (await client.callTool({
        name: 'atomic_exec',
        arguments: {
          command: 'node -e "require(\'node:fs\').writeFileSync(\'created.txt\', \'PROVEN\\n\')"',
          cwd: execEffectRel,
          proveEffect: true,
          intent: 'smoke proven shell write records byte effect',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const execProvenBody = jsonBody(execProven);
      check(
        'atomic_exec proven mutable command records byte effect',
        execProven.isError !== true &&
          execProvenBody.ok === true &&
          execProvenBody.commandClass === 'mutable-or-unknown' &&
          execProvenBody.atomicEnvelope?.effectProven === true &&
          execProvenBody.effect?.changedFiles === 1 &&
          execProvenBody.effect?.files?.[0]?.file === 'created.txt',
        execProven.content.map((p) => p.text).join('\n'),
      );
    } finally {
      fs.rmSync(execEffectAbs, { recursive: true, force: true });
    }

    const lockId = `.smoke-lock-${process.pid}`;
    const acquired = (await client.callTool({
      name: 'atomic_lock_acquire',
      arguments: { frontId: lockId, owner: 'smoke', objective: 'prove mkdir lock' },
    })) as { content: { text: string }[] };
    const acquiredBody = jsonBody(acquired);
    check('atomic lock acquire works', acquiredBody.ok === true, acquired.content[0]?.text ?? '');
    const status = (await client.callTool({
      name: 'atomic_lock_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const statusBody = jsonBody(status);
    check(
      'atomic lock status lists acquired lock',
      Array.isArray(statusBody.locks) &&
        statusBody.locks.some((lock: { frontId?: string }) => lock.frontId === lockId),
      status.content[0]?.text ?? '',
    );
    const released = (await client.callTool({
      name: 'atomic_lock_release',
      arguments: { frontId: lockId, owner: 'smoke', reason: 'smoke complete' },
    })) as { content: { text: string }[] };
    const releasedBody = jsonBody(released);
    check(
      'atomic lock release works',
      releasedBody.changed === true,
      released.content[0]?.text ?? '',
    );

    // live sha256 optimistic-concurrency guard
    const cur = fs.readFileSync(fixtureAbs, 'utf8');
    const okSha = (await client.callTool({
      name: 'atomic_add_import',
      arguments: {
        file: fixtureRel,
        module: './z',
        name: 'Zed',
        expectedSha256: sha(cur),
        preview: true,
      },
    })) as { content: { text: string }[] };
    check(
      'sha guard passes on correct hash',
      jsonBody(okSha).ok === true,
      okSha.content[0].text,
    );
    const badSha = (await client.callTool({
      name: 'atomic_add_import',
      arguments: { file: fixtureRel, module: './z', name: 'Zed', expectedSha256: 'deadbeef' },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'sha guard refuses on stale hash',
      badSha.isError === true && /sha256 mismatch/.test(badSha.content[0].text),
      badSha.content[0].text,
    );

    const batchRel = path.join('scripts', 'mcp', 'atomic-edit', '.smoke-batch-replace.' + process.pid + '.ts');
    const batchAbs = path.join(repoRoot, batchRel);
    const batchBefore = 'export const alpha = 1;\nexport const beta = 2;\n';
    fs.writeFileSync(batchAbs, batchBefore);
    try {
      const batchPreview = (await client.callTool({
        name: 'atomic_batch_replace_text',
        arguments: {
          intent: 'prove clustered replacements can preview as one transaction',
          preview: true,
          replacements: [
            { file: batchRel, oldText: 'alpha = 1', newText: 'alpha = 10' },
            { file: batchRel, oldText: 'beta = 2', newText: 'beta = 20' },
          ],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const batchPreviewBody = jsonBody(batchPreview);
      check(
        'atomic_batch_replace_text previews clustered replacements without writing',
        batchPreview.isError !== true &&
          batchPreviewBody.ok === true &&
          batchPreviewBody.preview === true &&
          batchPreviewBody.replacements === 2 &&
          fs.readFileSync(batchAbs, 'utf8') === batchBefore,
        batchPreview.content[0]?.text ?? '',
      );

      const batchCommit = (await client.callTool({
        name: 'atomic_batch_replace_text',
        arguments: {
          intent: 'prove clustered replacements commit as one compact transaction',
          replacements: [
            { file: batchRel, oldText: 'alpha = 1', newText: 'alpha = 10' },
            { file: batchRel, oldText: 'beta = 2', newText: 'beta = 20' },
          ],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const batchCommitBody = jsonBody(batchCommit);
      check(
        'atomic_batch_replace_text commits multiple replacements with one receipt',
        batchCommit.isError !== true &&
          batchCommitBody.ok === true &&
          batchCommitBody.transaction === true &&
          batchCommitBody.replacements === 2 &&
          batchCommitBody.files?.[0]?.replacements === 2 &&
          batchCommitBody.files?.[0]?.negativeActionProofAuto === true &&
          Array.isArray(batchCommitBody.traceRefs) &&
          batchCommitBody.traceRefs.length === 1 &&
          fs.readFileSync(batchAbs, 'utf8').includes('alpha = 10') &&
          fs.readFileSync(batchAbs, 'utf8').includes('beta = 20'),
        batchCommit.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(batchAbs)) fs.unlinkSync(batchAbs);
    }

    // ── Inescapable convergence at the byte floor (immutable; no env, no flag) ──
    // EVERY write funnels through atomicWrite, which refuses any write that would
    // INTRODUCE a dangling relative import — and commits one whose import resolves.
    // Uses its own throwaway file so the shared fixture is untouched.
    const convRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-converge.${process.pid}.ts`);
    const convAbs = path.join(repoRoot, convRel);
    fs.writeFileSync(convAbs, 'export const y = 1;\n');
    try {
      const dangle = (await client.callTool({
        name: 'atomic_add_import',
        arguments: { file: convRel, module: './does_not_exist_zzz', name: 'Nope' },
      })) as { content: { text: string }[]; isError?: boolean };
      const dangleText = dangle.content.map((p) => p.text).join('\n');
      check(
        'byte-floor REFUSES a write that introduces a dangling relative import',
        (dangle.isError === true || /refused \(convergence\)/.test(dangleText)) &&
          fs.readFileSync(convAbs, 'utf8') === 'export const y = 1;\n',
        dangleText,
      );
      const resolved = (await client.callTool({
        name: 'atomic_add_import',
        arguments: { file: convRel, module: './engine', name: 'applyEdits' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'byte-floor COMMITS a write whose relative import resolves',
        resolved.isError !== true && /from ['"]\.\/engine['"]/.test(fs.readFileSync(convAbs, 'utf8')),
        resolved.content.map((p) => p.text).join('\n'),
      );
    } finally {
      if (fs.existsSync(convAbs)) fs.unlinkSync(convAbs);
    }

    // ── The one-tool collapse: atomic_converge runs the full WRITE gate registry ──
    // (preview/commit:false → nothing written; convergeStatic runs all gates first).
    const convPreviewRel = path.join('scripts', 'mcp', 'atomic-edit', 'gates', `.smoke-converge-${process.pid}.ts`);
    const convRed = (await client.callTool({
      name: 'atomic_converge',
      arguments: {
        mutations: [{ file: convPreviewRel, newText: 'import { z } from "totally-absent-pkg-xyz";\nexport const y = z;\n' }],
        commit: false,
      },
    })) as { content: { text: string }[] };
    const convRedBody = jsonBody(convRed);
    check(
      'atomic_converge refuses a mutation that introduces a dangling dependency (supply-chain gate fires through the one tool)',
      convRedBody.converged === false && convRedBody.refusedGate === 'supply-chain',
      convRed.content[0]?.text ?? '',
    );
    const convGreen = (await client.callTool({
      name: 'atomic_converge',
      arguments: {
        mutations: [{ file: convPreviewRel, newText: 'import * as fs from "node:fs";\nexport const reachable = fs.existsSync("/");\n' }],
        commit: false,
      },
    })) as { content: { text: string }[] };
    const convGreenBody = jsonBody(convGreen);
    check(
      'atomic_converge passes a clean mutation — no false red from the 7 folded write gates',
      convGreenBody.converged === true,
      convGreen.content[0]?.text ?? '',
    );

    // ── Byte-floor supply-chain: a NEW bare import to an absent package is refused at
    // the floor (the dependency twin of the connection gate — inescapable per-write).
    const bfRel = path.join('scripts', 'mcp', 'atomic-edit', 'gates', `.smoke-bf-${process.pid}.ts`);
    const bf = (await client.callTool({
      name: 'atomic_create_file',
      arguments: { file: bfRel, content: 'import { x } from "totally-absent-pkg-zzz";\nexport const y = x;\n' },
    })) as { content: { text: string }[]; isError?: boolean };
    const bfText = bf.content.map((p) => p.text).join('\n');
    check(
      'byte-floor refuses a NEW bare import to an absent package (supply-chain at the floor)',
      bf.isError === true || /dangling dependency/.test(bfText),
      bfText,
    );
    if (fs.existsSync(path.join(repoRoot, bfRel))) fs.unlinkSync(path.join(repoRoot, bfRel));

}
