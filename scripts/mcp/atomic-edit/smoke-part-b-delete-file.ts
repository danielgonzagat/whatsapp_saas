import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check, sha, type PartBCtx } from "./smoke-state.js";


export async function partBDeleteFile(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    // ── atomic_delete_file ──
    const delRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-delete.${process.pid}.ts`);
    const delAbs = path.join(repoRoot, delRel);
    fs.writeFileSync(delAbs, 'export const WILL_DELETE = 1;\n');
    const delBefore = fs.readFileSync(delAbs, 'utf8');
    const delSha = sha(delBefore);

    try {
      const delPrev = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel, preview: true },
      })) as { content: { text: string }[] };
      const delPrevBody = JSON.parse(delPrev.content.at(-1)?.text ?? '{}');
      const delPrevTracePath =
        typeof delPrevBody.tracePath === 'string' ? path.join(repoRoot, delPrevBody.tracePath) : '';
      const delPrevTrace =
        delPrevTracePath && fs.existsSync(delPrevTracePath)
          ? JSON.parse(fs.readFileSync(delPrevTracePath, 'utf8'))
          : {};
      check(
        'delete_file preview does not delete',
        delPrevBody.preview === true &&
          delPrevBody.changed === false &&
          String(delPrevBody.note).includes('dry-run') &&
          fs.existsSync(delAbs),
        delPrev.content[0]?.text ?? '',
      );
      check(
        'delete_file preview trace is honest',
        delPrevTrace.operation === 'atomic_delete_file' &&
          delPrevTrace.preview === true &&
          delPrevTrace.changed === false &&
          delPrevTrace.afterSha256 === sha(delBefore) &&
          delPrevTrace.proposedSha256 === sha(''),
        JSON.stringify(delPrevTrace),
      );

      const delCommit = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel, expectedSha256: delSha },
      })) as { content: { text: string }[] };
      const delCommitBody = JSON.parse(delCommit.content.at(-1)?.text ?? '{}');
      const delCommitTracePath =
        typeof delCommitBody.tracePath === 'string'
          ? path.join(repoRoot, delCommitBody.tracePath)
          : '';
      const delCommitTrace =
        delCommitTracePath && fs.existsSync(delCommitTracePath)
          ? JSON.parse(fs.readFileSync(delCommitTracePath, 'utf8'))
          : {};
      check(
        'delete_file commit deletes the file',
        delCommitBody.ok === true &&
          delCommitBody.changed === true &&
          delCommitBody.deleted === true &&
          delCommitBody.afterSha256 === sha('') &&
          !fs.existsSync(delAbs),
        delCommit.content[0]?.text ?? '',
      );
      check(
        'delete_file commit trace is honest',
        delCommitTrace.operation === 'atomic_delete_file' &&
          delCommitTrace.preview === false &&
          delCommitTrace.changed === true &&
          delCommitTrace.afterSha256 === sha('') &&
          delCommitTrace.semanticImpact === 'file_deleted',
        JSON.stringify(delCommitTrace),
      );

      const delMissing = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel },
      })) as { content: { text: string }[] };
      const delMissingBody = JSON.parse(delMissing.content.at(-1)?.text ?? '{}');
      check(
        'delete_file idempotent on absent file',
        delMissingBody.ok === true &&
          delMissingBody.changed === false &&
          delMissingBody.exists === false,
        delMissing.content[0]?.text ?? '',
      );

      const delDir = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: 'scripts/mcp/atomic-edit' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'delete_file refuses directory',
        delDir.isError === true && /directory/.test(delDir.content[0]?.text ?? ''),
        delDir.content[0]?.text ?? '',
      );

      const delProtected = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: 'CLAUDE.md' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'delete_file refuses governance-protected file',
        delProtected.isError === true &&
          /governance-protected/.test(delProtected.content[0]?.text ?? ''),
        delProtected.content[0]?.text ?? '',
      );

      const delShaRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-delete-sha.${process.pid}.ts`,
      );
      const delShaAbs = path.join(repoRoot, delShaRel);
      fs.writeFileSync(delShaAbs, 'export const SHA_GUARD = 1;\n');
      try {
        const delBadSha = (await client.callTool({
          name: 'atomic_delete_file',
          arguments: { file: delShaRel, expectedSha256: 'deadbeef' },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'delete_file sha guard refuses stale hash',
          delBadSha.isError === true && /sha256 mismatch/.test(delBadSha.content[0]?.text ?? ''),
          delBadSha.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(delShaAbs)) fs.unlinkSync(delShaAbs);
      }
    } finally {
      if (fs.existsSync(delAbs)) fs.unlinkSync(delAbs);
    }

    // absolute paths inside registered git worktrees must target that worktree,
    // not the coordinator's main repo root.
    const linkedParent = fs.mkdtempSync(path.join(os.tmpdir(), `atomic-edit-wt-${process.pid}-`));
    const linkedRoot = path.join(linkedParent, 'repo');
    const linkedRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-linked-worktree.${process.pid}.ts`,
    );
    const linkedAbs = path.join(linkedRoot, linkedRel);
    try {
      childProcess.execFileSync('git', ['worktree', 'add', '--detach', linkedRoot, 'HEAD'], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      fs.writeFileSync(linkedAbs, 'export const LINKED = 1;\n');
      const linked = (await client.callTool({
        name: 'atomic_replace_text',
        arguments: { file: linkedAbs, oldText: '1', newText: '2' },
      })) as { content: { text: string }[]; isError?: boolean };
      const linkedBody = JSON.parse(linked.content.at(-1)?.text ?? '{}');
      check(
        'absolute registered worktree path accepted',
        linkedBody.ok === true && linkedBody.changed === true,
        linked.content[0]?.text ?? '',
      );
      check(
        'absolute registered worktree path mutates linked worktree',
        fs.readFileSync(linkedAbs, 'utf8') === 'export const LINKED = 2;\n',
        fs.readFileSync(linkedAbs, 'utf8'),
      );
      check(
        'absolute registered worktree path does not create main-root side effect',
        !fs.existsSync(path.join(repoRoot, linkedRel)),
        linkedRel,
      );
    } finally {
      if (fs.existsSync(linkedAbs)) fs.unlinkSync(linkedAbs);
      try {
        childProcess.execFileSync('git', ['worktree', 'remove', linkedRoot], {
          cwd: repoRoot,
          stdio: 'ignore',
        });
      } catch {
        fs.rmSync(linkedRoot, { recursive: true, force: true });
      }
      fs.rmSync(linkedParent, { recursive: true, force: true });
    }
}
