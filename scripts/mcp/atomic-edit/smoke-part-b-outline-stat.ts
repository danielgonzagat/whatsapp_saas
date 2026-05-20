import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check, sha } from "./smoke-state.js";
interface PartBCtx { client: any; fixtureAbs: string; fixtureRel: string; repoRoot: string; }

export async function partBOutlineStat(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;

    const out = (await client.callTool({
      name: 'code_outline',
      arguments: { file: fixtureRel },
    })) as { content: { text: string }[] };
    const ob = JSON.parse(out.content[0].text);
    check('live code_outline ok', ob.ok === true && Array.isArray(ob.symbols), out.content[0].text);
    check('live code_outline omits fullText', !('fullText' in ob), out.content[0].text);
    check(
      'live code_outline reports target root',
      ob.target?.repoRoot === repoRoot && ob.target?.absPath === fixtureAbs,
      out.content[0].text,
    );

    const fileStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: fixtureRel },
    })) as { content: { text: string }[] };
    const fileStatBody = JSON.parse(fileStat.content.at(-1)?.text ?? '{}');
    const fixtureBytes = fs.readFileSync(fixtureAbs);
    check(
      'code_file_stat fixture file returns ok+exists',
      fileStatBody.ok === true &&
        fileStatBody.changed === false &&
        fileStatBody.exists === true &&
        fileStatBody.kind === 'file' &&
        fileStatBody.bytes === fixtureBytes.byteLength &&
        typeof fileStatBody.sha256 === 'string' &&
        typeof fileStatBody.mtimeMs === 'number',
      fileStat.content[0]?.text ?? '',
    );
    check(
      'code_file_stat fixture file raw hash matches bytes',
      fileStatBody.sha256 === sha(fixtureBytes),
      `${fileStatBody.sha256} vs ${sha(fixtureBytes)}`,
    );
    check(
      'code_file_stat fixture file never returns content',
      !('content' in fileStatBody) &&
        !('text' in fileStatBody) &&
        !('data' in fileStatBody) &&
        !('fullText' in fileStatBody),
      JSON.stringify(Object.keys(fileStatBody)),
    );

    const missingStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: `scripts/mcp/atomic-edit/.smoke-nonexistent.${process.pid}.ts` },
    })) as { content: { text: string }[] };
    const missingStatBody = JSON.parse(missingStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat missing path is non-throwing (ok:true, kind:missing)',
      missingStatBody.ok === true &&
        missingStatBody.changed === false &&
        missingStatBody.exists === false &&
        missingStatBody.kind === 'missing',
      missingStat.content[0]?.text ?? '',
    );

    const dirStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: 'scripts/mcp/atomic-edit' },
    })) as { content: { text: string }[] };
    const dirStatBody = JSON.parse(dirStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat directory returns kind=directory, no sha256/bytes/content',
      dirStatBody.ok === true &&
        dirStatBody.changed === false &&
        dirStatBody.exists === true &&
        dirStatBody.kind === 'directory' &&
        !('sha256' in dirStatBody) &&
        !('bytes' in dirStatBody) &&
        !('content' in dirStatBody),
      dirStat.content[0]?.text ?? '',
    );

    const protectedStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: 'CLAUDE.md' },
    })) as { content: { text: string }[] };
    const protectedStatBody = JSON.parse(protectedStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat protected path marked protected=true, no content/bytes/sha256',
      protectedStatBody.ok === true &&
        protectedStatBody.protected === true &&
        !('sha256' in protectedStatBody) &&
        !('bytes' in protectedStatBody) &&
        !('content' in protectedStatBody),
      protectedStat.content[0]?.text ?? '',
    );

    const prev = (await client.callTool({
      name: 'atomic_insert_at',
      arguments: { file: fixtureRel, line: 1, column: 1, text: '// hdr\n', preview: true },
    })) as { content: { text: string }[] };
    const pb = JSON.parse(prev.content.at(-1)?.text ?? '{}');
    check(
      'preview dry-run does not write',
      pb.preview === true && pb.changed === false && typeof pb.diff === 'string',
      prev.content[0].text,
    );

    const literalPreviewBefore = fs.readFileSync(fixtureAbs, 'utf8');
    const literalPreview = (await client.callTool({
      name: 'atomic_replace_literal',
      arguments: {
        file: fixtureRel,
        currentText: "'5511999999999'",
        newText: 'null',
        expectedSha256: sha(literalPreviewBefore),
        preview: true,
      },
    })) as { content: { text: string }[] };
    const literalPreviewBody = JSON.parse(literalPreview.content.at(-1)?.text ?? '{}');
    check(
      'literal preview dry-run does not write',
      literalPreviewBody.preview === true &&
        literalPreviewBody.changed === false &&
        fs.readFileSync(fixtureAbs, 'utf8') === literalPreviewBefore,
      literalPreview.content[0].text,
    );
    const literalPreviewTracePath =
      typeof literalPreviewBody.tracePath === 'string'
        ? path.join(repoRoot, literalPreviewBody.tracePath)
        : '';
    const literalPreviewTrace =
      literalPreviewTracePath && fs.existsSync(literalPreviewTracePath)
        ? JSON.parse(fs.readFileSync(literalPreviewTracePath, 'utf8'))
        : {};
    const literalPreviewProposal = literalPreviewBefore.replace("'5511999999999'", 'null');
    check(
      'literal preview trace marks proposed but not written',
      literalPreviewTrace.preview === true &&
        literalPreviewTrace.changed === false &&
        literalPreviewTrace.afterSha256 === sha(literalPreviewBefore) &&
        literalPreviewTrace.proposedSha256 === sha(literalPreviewProposal),
      JSON.stringify(literalPreviewTrace),
    );

    const res = (await client.callTool({
      name: 'atomic_replace_literal',
      arguments: { file: fixtureRel, currentText: "'5511999999999'", newText: 'null' },
    })) as { content: { text: string }[]; isError?: boolean };
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}');
    check(
      'live literal swap returns human summary first',
      res.content.length >= 2 && /Atomic edit applied/.test(res.content[0]?.text ?? ''),
      res.content[0]?.text ?? '',
    );
    check('live literal swap ok', body.ok === true && body.changed === true, res.content[0].text);
    const after = fs.readFileSync(fixtureAbs, 'utf8');
    check(
      'fixture mutated on disk',
      after === 'export const TARGET = null;\n',
      JSON.stringify(after),
    );

    // governance guard must refuse a protected file
    const guarded = (await client.callTool({
      name: 'atomic_insert_at',
      arguments: { file: 'CLAUDE.md', line: 1, column: 1, text: 'x' },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'protected file refused',
      guarded.isError === true && /governance-protected/.test(guarded.content[0].text),
      guarded.content[0].text,
    );

}
