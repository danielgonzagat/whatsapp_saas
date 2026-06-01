import * as fs from "node:fs";
import * as path from "node:path";
import { check, sha, type PartBCtx } from "./smoke-state.js";


export async function partBSetup(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
  const tools = await client.listTools();
  const names = tools.tools.map((t: { name: string }) => t.name).sort();
    check(
      'server lists all 76 tools (incl. atomic_expand_self + Y certificate + apex: lens (atomic_lens/atomic_grep_calls/atomic_repair_scope) + atomic_session_* (begin/savepoint/rollback/commit) + atomic_prove (gate-sourced receipt) + atomic_exec shell operator + content-addressed atomic_replace_at + atomic_locate + universal native engine: atomic_grep + atomic_glob + atomic_outline + atomic_ast_search + atomic_ast_edit + atomic_ast_rewrite + atomic_apply_workspace_edit + atomic_native_status + atomic_create_file + atomic_delete_file + code_file_stat + analyzer transaction + product apex layer + rename property key + add await to call + insert after anchor + insert before anchor + replace between anchors + replace text in anchor region + atomic_edit unified router + code_outline_batch)',
      names.length === 76 &&
          names.includes('atomic_exec') &&
          names.includes('atomic_expand_self') &&
          names.includes('atomic_y_certificate') &&
          names.includes('atomic_converge') &&
          names.includes('atomic_rename_symbol_universal') &&
          names.includes('atomic_bypass_report') &&
          names.includes('atomic_replace_at') &&
          names.includes('atomic_locate') &&
          names.includes('atomic_grep') &&
          names.includes('atomic_glob') &&
          names.includes('atomic_outline') &&
        names.includes('atomic_lens') &&
        names.includes('atomic_grep_calls') &&
        names.includes('atomic_repair_scope') &&
        names.includes('atomic_session_begin') &&
        names.includes('atomic_session_savepoint') &&
        names.includes('atomic_session_rollback') &&
        names.includes('atomic_session_commit') &&
        names.includes('atomic_prove') &&
        names.includes('atomic_create_file') &&
        names.includes('atomic_delete_file') &&
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
        names.includes('code_outline_batch'),
      names.join(','),
    );

    const intent = (await client.callTool({
      name: 'product_intent_contract',
      arguments: { goal: 'fazer o chat do admin persistir mensagens em Postgres' },
    })) as { content: { text: string }[] };
    const intentBody = JSON.parse(intent.content.at(-1)?.text ?? '{}');
    check(
      'product intent maps chat persistence',
      intentBody.ok === true && intentBody.targetIntegration === 'chat_persistence',
      intent.content[0]?.text ?? '',
    );

    const zct = (await client.callTool({
      name: 'zero_code_trust_score',
      arguments: {
        evidence: [{ kind: 'browser', status: 'passed', summary: 'user flow passed' }],
        founderCanValidateByProduct: true,
      },
    })) as { content: { text: string }[] };
    const zctBody = JSON.parse(zct.content.at(-1)?.text ?? '{}');
    check(
      'zero-code trust reaches 100 with product proof',
      zctBody.score === 100 && zctBody.verdict === 'PRODUCT_VALIDATABLE',
      zct.content[0]?.text ?? '',
    );

    const receipt = (await client.callTool({
      name: 'behavior_receipt',
      arguments: {
        productBehavior: 'Admin chat reloads persisted messages',
        validation: [{ kind: 'api', status: 'passed', summary: 'messages returned' }],
        clickPath: ['Admin', 'Chat', 'Reload session'],
      },
    })) as { content: { text: string }[] };
    const receiptBody = JSON.parse(receipt.content.at(-1)?.text ?? '{}');
    check(
      'behavior receipt produces founder proof',
      receiptBody.zeroCodeTrust === 100 && receiptBody.productProof === true,
      receipt.content[0]?.text ?? '',
    );

    const truth = (await client.callTool({
      name: 'truth_receipt',
      arguments: {
        claims: [
          { claim: 'API persisted message', evidenceKind: 'db', status: 'passed' },
          { claim: 'UI button is live', evidenceKind: 'stub', status: 'passed' },
        ],
      },
    })) as { content: { text: string }[] };
    const truthBody = JSON.parse(truth.content.at(-1)?.text ?? '{}');
    check(
      'truth receipt refuses stub as real',
      truthBody.claims?.[0]?.truth === 'REAL' && truthBody.claims?.[1]?.truth === 'STUB',
      truth.content[0]?.text ?? '',
    );

    const continuity = (await client.callTool({
      name: 'continuity_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const continuityBody = JSON.parse(continuity.content.at(-1)?.text ?? '{}');
    check(
      'continuity status reads repo state',
      continuityBody.ok === true && typeof continuityBody.nextAction === 'string',
      continuity.content[0]?.text ?? '',
    );

    const yCert = (await client.callTool({
      name: 'atomic_y_certificate',
      arguments: { scope: 'whole-host', includeAudits: false },
    })) as { content: { text: string }[] };
    const yCertBody = JSON.parse(yCert.content.at(-1)?.text ?? '{}');
    const yDomains = Array.isArray(yCertBody.domains) ? yCertBody.domains : [];
    const yDomain = (domain: string): { domain?: string; status?: string } | undefined =>
      yDomains.find((entry: { domain?: string }) => entry.domain === domain);
    check(
      'Y certificate refuses current whole-host universality until active host sandbox',
      yCertBody.ok === true &&
        yCertBody.yComplete === false &&
        yCertBody.verdict === 'Y_BLOCKED' &&
        yCertBody.blockers?.some((b: { domain?: string }) => b.domain === 'wholeHostActionSpace') &&
        yDomain('externalRuntimeState')?.status === 'GREEN' &&
        yDomain('arbitraryInterpreterSandbox')?.status === 'GREEN' &&
        yDomain('atomicityAudit')?.status === 'UNJUDGED',
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
    })) as { content: { text: string }[]; isError?: boolean };
    const selfAllowedBody = JSON.parse(selfAllowed.content.at(-1)?.text ?? '{}');
    check(
      'atomic_expand_self creates atomic source only after proofs pass',
      selfAllowed.isError !== true &&
        selfAllowedBody.ok === true &&
        selfAllowedBody.admission === 'self-expansion-proof-green' &&
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
    })) as { content: { text: string }[]; isError?: boolean };
    const selfCleanupBody = JSON.parse(selfCleanup.content.at(-1)?.text ?? '{}');
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
    const readOnlyExecBody = JSON.parse(readOnlyExec.content.at(-1)?.text ?? '{}');
    check(
      'atomic_exec allows classified read-only command without effect proof',
      readOnlyExec.isError !== true &&
        readOnlyExecBody.ok === true &&
        readOnlyExecBody.atomicEnvelope?.effectProven === false &&
        readOnlyExecBody.commandClass === 'read-only',
      readOnlyExec.content.map((p) => p.text).join('\n'),
    );

    const execUnprovenRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-exec-unproven.${process.pid}.txt`);
    const execUnprovenAbs = path.join(repoRoot, execUnprovenRel);
    try {
      const execUnproven = (await client.callTool({
        name: 'atomic_exec',
        arguments: {
          command: `node -e 'require("node:fs").writeFileSync(${JSON.stringify(execUnprovenRel)}, "UNPROVEN")'`,
          cwd: repoRoot,
          intent: 'smoke unproven shell write must be refused',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const unprovenText = execUnproven.content.map((p) => p.text).join('\n');
      check(
        'atomic_exec refuses mutable-or-unknown command without proveEffect',
        execUnproven.isError === true &&
          /requires proveEffect:true|mutable-or-unknown/i.test(unprovenText) &&
          !fs.existsSync(execUnprovenAbs),
        unprovenText,
      );
    } finally {
      if (fs.existsSync(execUnprovenAbs)) fs.unlinkSync(execUnprovenAbs);
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
      const execProvenBody = JSON.parse(execProven.content.at(-1)?.text ?? '{}');
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
    const acquiredBody = JSON.parse(acquired.content.at(-1)?.text ?? '{}');
    check('atomic lock acquire works', acquiredBody.ok === true, acquired.content[0]?.text ?? '');
    const status = (await client.callTool({
      name: 'atomic_lock_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const statusBody = JSON.parse(status.content.at(-1)?.text ?? '{}');
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
    const releasedBody = JSON.parse(released.content.at(-1)?.text ?? '{}');
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
      JSON.parse(okSha.content.at(-1)?.text ?? '{}').ok === true,
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
    const convRedBody = JSON.parse(convRed.content.at(-1)?.text ?? '{}');
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
    const convGreenBody = JSON.parse(convGreen.content.at(-1)?.text ?? '{}');
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
