import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, type PartBCtx } from "./smoke-state.js";


export async function partBReplaceBetween(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    // ── atomic_replace_between_anchors ──
    const replaceRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-replace-anchors.${process.pid}.ts`,
    );
    const replaceAbs = path.join(repoRoot, replaceRel);
    fs.writeFileSync(replaceAbs, 'export let DATA = `BEFORE alpha MIDDLE omega AFTER`;\n');
    try {
      const replaceRes = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          replacementText: 'REPLACED',
          proofOfIncorrectness: 'smoke anchor fixture middle text is stale negative data and may be replaced',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const replaceBody = jsonBody(replaceRes);
      check(
        'replace_between_anchors replaces text between anchors',
        replaceRes.isError !== true && replaceBody.ok === true && replaceBody.changed === true,
        replaceRes.content[0]?.text ?? '',
      );
      const replaceAfter = fs.readFileSync(replaceAbs, 'utf8');
      check(
        'replace_between_anchors preserves both anchors',
        replaceAfter === 'export let DATA = `BEFORE alpha REPLACED omega AFTER`;\n' &&
          replaceAfter.indexOf('alpha ') < replaceAfter.indexOf('REPLACED') &&
          replaceAfter.indexOf('REPLACED') < replaceAfter.indexOf(' omega'),
        JSON.stringify(replaceAfter),
      );

      const previewBefore = fs.readFileSync(replaceAbs, 'utf8');
      const replacePreview = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'REPLACED',
          endAnchorText: 'AFTER',
          replacementText: 'PREVIEW',
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const replacePreviewBody = jsonBody(replacePreview);
      check(
        'replace_between_anchors preview does not write',
        replacePreview.isError !== true &&
          replacePreviewBody.preview === true &&
          replacePreviewBody.changed === false &&
          fs.readFileSync(replaceAbs, 'utf8') === previewBefore,
        replacePreview.content[0]?.text ?? '',
      );

      const replaceMissingStart = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'NONEXISTENT',
          endAnchorText: 'omega',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses missing start anchor',
        replaceMissingStart.isError === true &&
          /start anchor text not found/.test(replaceMissingStart.content[0]?.text ?? ''),
        replaceMissingStart.content[0]?.text ?? '',
      );

      const replaceMissingEnd = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha',
          endAnchorText: 'NONEXISTENT',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses missing end anchor after start',
        replaceMissingEnd.isError === true &&
          /end anchor text not found/.test(replaceMissingEnd.content[0]?.text ?? ''),
        replaceMissingEnd.content[0]?.text ?? '',
      );

      const replaceEmptyStart = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: '',
          endAnchorText: 'omega',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses empty start anchor',
        replaceEmptyStart.isError === true,
        replaceEmptyStart.content[0]?.text ?? '',
      );

      const replaceEmptyEnd = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha',
          endAnchorText: '',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses empty end anchor',
        replaceEmptyEnd.isError === true,
        replaceEmptyEnd.content[0]?.text ?? '',
      );

      const ambigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-replace-anchors-ambig.${process.pid}.ts`,
      );
      const ambigAbs = path.join(repoRoot, ambigRel);
      fs.writeFileSync(
        ambigAbs,
        'export let X = `BEFORE alpha BODY omega alpha BODY2 omega AFTER`;\n',
      );
      try {
        const replaceAmbig = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            replacementText: 'REPLACED',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_between_anchors refuses ambiguous start without occurrence',
          replaceAmbig.isError === true &&
            /appears 2 times/.test(replaceAmbig.content[0]?.text ?? ''),
          replaceAmbig.content[0]?.text ?? '',
        );

        const replaceOccurrence = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            replacementText: 'SECOND',
            occurrence: 2,
            proofOfIncorrectness: 'smoke anchor occurrence text is stale negative data and may be replaced',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const replaceOccurrenceBody = jsonBody(replaceOccurrence);
        check(
          'replace_between_anchors occurrence targets requested match',
          replaceOccurrence.isError !== true &&
            replaceOccurrenceBody.ok === true &&
            replaceOccurrenceBody.changed === true,
          replaceOccurrence.content[0]?.text ?? '',
        );
        const ambigAfter = fs.readFileSync(ambigAbs, 'utf8');
        check(
          'replace_between_anchors occurrence replaces only between second pair',
          ambigAfter === 'export let X = `BEFORE alpha BODY omega alpha SECOND omega AFTER`;\n',
          JSON.stringify(ambigAfter),
        );

        const replaceOutOfRange = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha',
            endAnchorText: 'omega',
            replacementText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_between_anchors refuses out-of-range occurrence',
          replaceOutOfRange.isError === true &&
            /out of range/.test(replaceOutOfRange.content[0]?.text ?? ''),
          replaceOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(ambigAbs)) fs.unlinkSync(ambigAbs);
      }

      const replaceBadSha = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'REPLACED',
          endAnchorText: 'AFTER',
          replacementText: 'SHA',
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors sha guard refuses stale hash',
        replaceBadSha.isError === true &&
          /sha256 mismatch/.test(replaceBadSha.content[0]?.text ?? ''),
        replaceBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(replaceAbs)) fs.unlinkSync(replaceAbs);
    }
}
