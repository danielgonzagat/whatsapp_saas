import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check, sha } from "./smoke-state.js";
interface PartBCtx { client: any; fixtureAbs: string; fixtureRel: string; repoRoot: string; }

export async function partBSetup(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
  const tools = await client.listTools();
  const names = tools.tools.map((t: { name: string }) => t.name).sort();
    check(
      'server lists all 37 tools (incl. atomic_create_file + atomic_delete_file + code_file_stat + analyzer transaction + product apex layer + rename property key + add await to call + insert after anchor + insert before anchor + replace between anchors + replace text in anchor region + atomic_edit unified router + code_outline_batch)',
      names.length === 37 &&
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

}
