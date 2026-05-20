import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check, sha } from "./smoke-state.js";
interface PartBCtx { client: any; fixtureAbs: string; fixtureRel: string; repoRoot: string; }

export async function partBAnchorBefore(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    // ── atomic_insert_before_anchor ──
    const beforeAnchorRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-before-anchor.${process.pid}.ts`,
    );
    const beforeAnchorAbs = path.join(repoRoot, beforeAnchorRel);
    fs.writeFileSync(beforeAnchorAbs, "export const ORDER = ['alpha'];\n");
    const beforeAnchorBefore = fs.readFileSync(beforeAnchorAbs, 'utf8');
    try {
      const beforeAnchorRes = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'alpha'",
          insertText: "'beta', ",
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const beforeAnchorBody = JSON.parse(beforeAnchorRes.content.at(-1)?.text ?? '{}');
      check(
        'insert_before_anchor inserts beta before alpha',
        beforeAnchorRes.isError !== true &&
          beforeAnchorBody.ok === true &&
          beforeAnchorBody.changed === true,
        beforeAnchorRes.content[0]?.text ?? '',
      );
      const beforeAnchorAfter = fs.readFileSync(beforeAnchorAbs, 'utf8');
      check(
        'insert_before_anchor preserves anchor and inserts only requested text',
        beforeAnchorAfter === "export const ORDER = ['beta', 'alpha'];\n" &&
          beforeAnchorAfter.indexOf("'alpha'") ===
            beforeAnchorBefore.indexOf("'alpha'") + "'beta', ".length,
        JSON.stringify(beforeAnchorAfter),
      );

      const beforeAnchorPreviewBefore = fs.readFileSync(beforeAnchorAbs, 'utf8');
      const beforeAnchorPreview = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'beta'",
          insertText: "'preview', ",
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const beforeAnchorPreviewBody = JSON.parse(beforeAnchorPreview.content.at(-1)?.text ?? '{}');
      check(
        'insert_before_anchor preview does not write',
        beforeAnchorPreview.isError !== true &&
          beforeAnchorPreviewBody.preview === true &&
          beforeAnchorPreviewBody.changed === false &&
          fs.readFileSync(beforeAnchorAbs, 'utf8') === beforeAnchorPreviewBefore,
        beforeAnchorPreview.content[0]?.text ?? '',
      );

      const beforeAnchorMissing = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: 'NONEXISTENT_ANCHOR',
          insertText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor refuses missing anchor',
        beforeAnchorMissing.isError === true &&
          /anchor text not found/.test(beforeAnchorMissing.content[0]?.text ?? ''),
        beforeAnchorMissing.content[0]?.text ?? '',
      );

      const beforeAnchorEmpty = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: { file: beforeAnchorRel, anchorText: '', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor refuses empty anchor',
        beforeAnchorEmpty.isError === true,
        beforeAnchorEmpty.content[0]?.text ?? '',
      );

      const beforeAmbigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-before-anchor-ambig.${process.pid}.ts`,
      );
      const beforeAmbigAbs = path.join(repoRoot, beforeAmbigRel);
      fs.writeFileSync(beforeAmbigAbs, "export const PAIR = ['anchor', 'anchor'];\n");
      try {
        const beforeAnchorAmbig = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: "'dup', ",
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_before_anchor refuses ambiguity without occurrence',
          beforeAnchorAmbig.isError === true &&
            /appears 2 times/.test(beforeAnchorAmbig.content[0]?.text ?? ''),
          beforeAnchorAmbig.content[0]?.text ?? '',
        );

        const beforeAnchorOccurrence = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: "'second', ",
            occurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const beforeAnchorOccurrenceBody = JSON.parse(
          beforeAnchorOccurrence.content.at(-1)?.text ?? '{}',
        );
        check(
          'insert_before_anchor occurrence targets requested match',
          beforeAnchorOccurrence.isError !== true &&
            beforeAnchorOccurrenceBody.ok === true &&
            beforeAnchorOccurrenceBody.changed === true,
          beforeAnchorOccurrence.content[0]?.text ?? '',
        );
        const beforeAmbigAfter = fs.readFileSync(beforeAmbigAbs, 'utf8');
        check(
          'insert_before_anchor occurrence inserts before second match',
          beforeAmbigAfter === "export const PAIR = ['anchor', 'second', 'anchor'];\n",
          JSON.stringify(beforeAmbigAfter),
        );

        const beforeAnchorOutOfRange = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_before_anchor refuses out-of-range occurrence',
          beforeAnchorOutOfRange.isError === true &&
            /out of range/.test(beforeAnchorOutOfRange.content[0]?.text ?? ''),
          beforeAnchorOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(beforeAmbigAbs)) fs.unlinkSync(beforeAmbigAbs);
      }

      const beforeAnchorBadSha = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'beta'",
          insertText: "'sha', ",
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor sha guard refuses stale hash',
        beforeAnchorBadSha.isError === true &&
          /sha256 mismatch/.test(beforeAnchorBadSha.content[0]?.text ?? ''),
        beforeAnchorBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(beforeAnchorAbs)) fs.unlinkSync(beforeAnchorAbs);
    }

}
