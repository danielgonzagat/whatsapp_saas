import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, type PartBCtx } from "./smoke-state.js";


export async function partBReplaceRegion(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    // ── atomic_replace_text_in_anchor_region ──
    const rtaRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-rta.${process.pid}.ts`);
    const rtaAbs = path.join(repoRoot, rtaRel);
    fs.writeFileSync(rtaAbs, 'export let A = `BEFORE alpha MIDDLE omega AFTER`;\n');
    try {
      const rtaRes = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'MIDDLE',
          newText: 'REPLACED',
          proofOfIncorrectness: 'smoke anchor-region fixture middle text is stale negative data and may be replaced',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const rtaBody = jsonBody(rtaRes);
      check(
        'replace_text_in_anchor_region replaces text inside region',
        rtaRes.isError !== true && rtaBody.ok === true && rtaBody.changed === true,
        rtaRes.content[0]?.text ?? '',
      );
      const rtaAfter = fs.readFileSync(rtaAbs, 'utf8');
      check(
        'replace_text_in_anchor_region preserves anchors',
        rtaAfter === 'export let A = `BEFORE alpha REPLACED omega AFTER`;\n' &&
          rtaAfter.indexOf('alpha ') < rtaAfter.indexOf('REPLACED') &&
          rtaAfter.indexOf('REPLACED') < rtaAfter.indexOf(' omega'),
        JSON.stringify(rtaAfter),
      );

      const rtaPreviewBefore = fs.readFileSync(rtaAbs, 'utf8');
      const rtaPreview = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'REPLACED',
          newText: 'PREVIEW',
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const rtaPreviewBody = jsonBody(rtaPreview);
      check(
        'replace_text_in_anchor_region preview does not write',
        rtaPreview.isError !== true &&
          rtaPreviewBody.preview === true &&
          rtaPreviewBody.changed === false &&
          fs.readFileSync(rtaAbs, 'utf8') === rtaPreviewBefore,
        rtaPreview.content[0]?.text ?? '',
      );

      const rtaMissingStart = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'NONEXISTENT',
          endAnchorText: ' omega',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses missing startAnchorText',
        rtaMissingStart.isError === true &&
          /startAnchorText not found/.test(rtaMissingStart.content[0]?.text ?? ''),
        rtaMissingStart.content[0]?.text ?? '',
      );

      const rtaMissingEnd = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: 'NONEXISTENT',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses missing endAnchorText after start',
        rtaMissingEnd.isError === true &&
          /endAnchorText not found/.test(rtaMissingEnd.content[0]?.text ?? ''),
        rtaMissingEnd.content[0]?.text ?? '',
      );

      const rtaEmptyStart = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: '',
          endAnchorText: ' omega',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty startAnchorText',
        rtaEmptyStart.isError === true,
        rtaEmptyStart.content[0]?.text ?? '',
      );

      const rtaEmptyEnd = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: '',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty endAnchorText',
        rtaEmptyEnd.isError === true,
        rtaEmptyEnd.content[0]?.text ?? '',
      );

      const rtaEmptyOld = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: '',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty oldText',
        rtaEmptyOld.isError === true,
        rtaEmptyOld.content[0]?.text ?? '',
      );

      // ── outside identical oldText preserved ──
      const rtaOutsideRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-outside.${process.pid}.ts`,
      );
      const rtaOutsideAbs = path.join(repoRoot, rtaOutsideRel);
      fs.writeFileSync(rtaOutsideAbs, 'export let X = `OUTSIDE alpha OUTSIDE omega OUTSIDE`;\n');
      try {
        const rtaOutside = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaOutsideRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'OUTSIDE',
            newText: 'INNER',
            proofOfIncorrectness: 'smoke anchor-region inner text is stale negative data and may be replaced',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaOutsideBody = jsonBody(rtaOutside);
        check(
          'replace_text_in_anchor_region preserves outside identical oldText',
          rtaOutside.isError !== true &&
            rtaOutsideBody.ok === true &&
            rtaOutsideBody.changed === true,
          rtaOutside.content[0]?.text ?? '',
        );
        const rtaOutsideAfter = fs.readFileSync(rtaOutsideAbs, 'utf8');
        check(
          'replace_text_in_anchor_region only replaces inside the region',
          rtaOutsideAfter === 'export let X = `OUTSIDE alpha INNER omega OUTSIDE`;\n' &&
            rtaOutsideAfter.indexOf('alpha ') < rtaOutsideAfter.indexOf('INNER') &&
            rtaOutsideAfter.indexOf('INNER') < rtaOutsideAfter.indexOf(' omega'),
          JSON.stringify(rtaOutsideAfter),
        );
      } finally {
        if (fs.existsSync(rtaOutsideAbs)) fs.unlinkSync(rtaOutsideAbs);
      }

      // ── ambiguous region + regionOccurrence + out-of-range regionOccurrence ──
      const rtaAmbigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-ambig.${process.pid}.ts`,
      );
      const rtaAmbigAbs = path.join(repoRoot, rtaAmbigRel);
      fs.writeFileSync(rtaAmbigAbs, 'const X = `R1 alpha A1 omega R1 alpha A2 omega R2`;\n');
      try {
        const rtaAmbig = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A1',
            newText: 'FIRST',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses ambiguous region without regionOccurrence',
          rtaAmbig.isError === true && /appears 2 times/.test(rtaAmbig.content[0]?.text ?? ''),
          rtaAmbig.content[0]?.text ?? '',
        );

        const rtaRegionOc = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A2',
            newText: 'SECOND',
            regionOccurrence: 2,
            proofOfIncorrectness: 'smoke anchor-region occurrence text is stale negative data and may be replaced',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaRegionOcBody = jsonBody(rtaRegionOc);
        check(
          'replace_text_in_anchor_region regionOccurrence targets correct region',
          rtaRegionOc.isError !== true &&
            rtaRegionOcBody.ok === true &&
            rtaRegionOcBody.changed === true,
          rtaRegionOc.content[0]?.text ?? '',
        );
        const rtaRegionOcAfter = fs.readFileSync(rtaAmbigAbs, 'utf8');
        check(
          'replace_text_in_anchor_region regionOccurrence replaces only in selected region',
          rtaRegionOcAfter === 'const X = `R1 alpha A1 omega R1 alpha SECOND omega R2`;\n',
          JSON.stringify(rtaRegionOcAfter),
        );

        // repair for next tests: write back original content
        fs.writeFileSync(rtaAmbigAbs, 'const X = `R1 alpha A1 omega R1 alpha A2 omega R2`;\n');

        const rtaRegionOoR = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A2',
            newText: 'X',
            regionOccurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses out-of-range regionOccurrence',
          rtaRegionOoR.isError === true && /out of range/.test(rtaRegionOoR.content[0]?.text ?? ''),
          rtaRegionOoR.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(rtaAmbigAbs)) fs.unlinkSync(rtaAmbigAbs);
      }

      // ── textOccurrence + out-of-range textOccurrence ──
      const rtaTextOcRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-textoc.${process.pid}.ts`,
      );
      const rtaTextOcAbs = path.join(repoRoot, rtaTextOcRel);
      fs.writeFileSync(rtaTextOcAbs, 'export let Z = `BEFORE alpha DUP DUP DUP omega AFTER`;\n');
      try {
        const rtaTextAmbig = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'REP',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses ambiguous oldText without textOccurrence',
          rtaTextAmbig.isError === true &&
            /appears 3 times/.test(rtaTextAmbig.content[0]?.text ?? ''),
          rtaTextAmbig.content[0]?.text ?? '',
        );

        const rtaTextOc = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'SELECTED',
            textOccurrence: 2,
            proofOfIncorrectness: 'smoke anchor-region selected duplicate text is stale negative data and may be replaced',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaTextOcBody = jsonBody(rtaTextOc);
        check(
          'replace_text_in_anchor_region textOccurrence selects correct match',
          rtaTextOc.isError !== true && rtaTextOcBody.ok === true && rtaTextOcBody.changed === true,
          rtaTextOc.content[0]?.text ?? '',
        );
        const rtaTextOcAfter = fs.readFileSync(rtaTextOcAbs, 'utf8');
        check(
          'replace_text_in_anchor_region textOccurrence replaces only selected match',
          rtaTextOcAfter === 'export let Z = `BEFORE alpha DUP SELECTED DUP omega AFTER`;\n',
          JSON.stringify(rtaTextOcAfter),
        );

        const rtaTextOoR = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'X',
            textOccurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses out-of-range textOccurrence',
          rtaTextOoR.isError === true && /out of range/.test(rtaTextOoR.content[0]?.text ?? ''),
          rtaTextOoR.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(rtaTextOcAbs)) fs.unlinkSync(rtaTextOcAbs);
      }

      const rtaBadSha = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'REPLACED',
          newText: 'SHA',
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region sha guard refuses stale hash',
        rtaBadSha.isError === true && /sha256 mismatch/.test(rtaBadSha.content[0]?.text ?? ''),
        rtaBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(rtaAbs)) fs.unlinkSync(rtaAbs);
    }
}
