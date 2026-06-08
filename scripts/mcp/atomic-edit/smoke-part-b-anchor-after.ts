import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, type PartBCtx } from "./smoke-state.js";


export async function partBAnchorAfter(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;

    // ── atomic_insert_after_anchor ──
    const anchorRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-anchor.${process.pid}.ts`);
    const anchorAbs = path.join(repoRoot, anchorRel);
    fs.writeFileSync(anchorAbs, "export const ORDER = ['alpha'];\n");
    const anchorBefore = fs.readFileSync(anchorAbs, 'utf8');
    try {
      const anchorRes = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'alpha'",
          insertText: ", 'beta'",
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const anchorBody = jsonBody(anchorRes);
      check(
        'insert_after_anchor inserts beta after alpha',
        anchorRes.isError !== true && anchorBody.ok === true && anchorBody.changed === true,
        anchorRes.content[0]?.text ?? '',
      );
      const anchorAfter = fs.readFileSync(anchorAbs, 'utf8');
      check(
        'insert_after_anchor preserves anchor and inserts only requested text',
        anchorAfter === "export const ORDER = ['alpha', 'beta'];\n" &&
          anchorAfter.indexOf("'alpha'") === anchorBefore.indexOf("'alpha'"),
        JSON.stringify(anchorAfter),
      );

      const previewBefore = fs.readFileSync(anchorAbs, 'utf8');
      const anchorPreview = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'beta'",
          insertText: ", 'preview'",
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const anchorPreviewBody = jsonBody(anchorPreview);
      check(
        'insert_after_anchor preview does not write',
        anchorPreview.isError !== true &&
          anchorPreviewBody.preview === true &&
          anchorPreviewBody.changed === false &&
          fs.readFileSync(anchorAbs, 'utf8') === previewBefore,
        anchorPreview.content[0]?.text ?? '',
      );

      const anchorMissing = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: { file: anchorRel, anchorText: 'NONEXISTENT_ANCHOR', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor refuses missing anchor',
        anchorMissing.isError === true &&
          /anchor text not found/.test(anchorMissing.content[0]?.text ?? ''),
        anchorMissing.content[0]?.text ?? '',
      );

      const anchorEmpty = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: { file: anchorRel, anchorText: '', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor refuses empty anchor',
        anchorEmpty.isError === true,
        anchorEmpty.content[0]?.text ?? '',
      );

      const ambigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-anchor-ambig.${process.pid}.ts`,
      );
      const ambigAbs = path.join(repoRoot, ambigRel);
      fs.writeFileSync(ambigAbs, "export const PAIR = ['anchor', 'anchor'];\n");
      try {
        const anchorAmbig = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: { file: ambigRel, anchorText: "'anchor'", insertText: ", 'dup'" },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_after_anchor refuses ambiguity without occurrence',
          anchorAmbig.isError === true &&
            /appears 2 times/.test(anchorAmbig.content[0]?.text ?? ''),
          anchorAmbig.content[0]?.text ?? '',
        );

        const anchorOccurrence = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: {
            file: ambigRel,
            anchorText: "'anchor'",
            insertText: ", 'second'",
            occurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const anchorOccurrenceBody = jsonBody(anchorOccurrence);
        check(
          'insert_after_anchor occurrence targets requested match',
          anchorOccurrence.isError !== true &&
            anchorOccurrenceBody.ok === true &&
            anchorOccurrenceBody.changed === true,
          anchorOccurrence.content[0]?.text ?? '',
        );
        const ambigAfter = fs.readFileSync(ambigAbs, 'utf8');
        check(
          'insert_after_anchor occurrence preserves first match',
          ambigAfter === "export const PAIR = ['anchor', 'anchor', 'second'];\n",
          JSON.stringify(ambigAfter),
        );

        const anchorOutOfRange = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: {
            file: ambigRel,
            anchorText: "'anchor'",
            insertText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_after_anchor refuses out-of-range occurrence',
          anchorOutOfRange.isError === true &&
            /out of range/.test(anchorOutOfRange.content[0]?.text ?? ''),
          anchorOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(ambigAbs)) fs.unlinkSync(ambigAbs);
      }

      const anchorBadSha = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'beta'",
          insertText: ", 'sha'",
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor sha guard refuses stale hash',
        anchorBadSha.isError === true &&
          /sha256 mismatch/.test(anchorBadSha.content[0]?.text ?? ''),
        anchorBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(anchorAbs)) fs.unlinkSync(anchorAbs);
    }
}
