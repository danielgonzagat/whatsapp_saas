import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import { guardSha, readUtf8 } from './server-helpers-io.js';
import { fail, commit } from './server-helpers-result.js';
import { shaArg } from './server-helpers-schema.js';

export function registerToolsE2(server: McpServer): void {
server.registerTool(
  'atomic_insert_after_anchor',
  {
    title: 'Insert text after an exact anchor',
    description:
      'Insert insertText immediately after the exact anchorText in the file. Unlike coordinate-based ' +
      'atomic_insert_at, this resolves by stable text anchor, avoiding line drift when surrounding ' +
      'code moves. If the anchor appears multiple times, pass occurrence to select the Nth match. ' +
      'Preserves the anchor text exactly; only insertText is added. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      anchorText: z.string().min(1).describe('exact verbatim text to find and insert after'),
      insertText: z.string().describe('text to insert immediately after the anchor'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const matches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.anchorText, offset)) !== -1) {
        matches.push(offset);
        offset += a.anchorText.length;
      }
      if (matches.length === 0) {
        return fail(`anchor text not found in ${relPath}: ${JSON.stringify(a.anchorText)}`);
      }
      if (matches.length > 1 && a.occurrence === undefined) {
        const lines = matches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `anchor text appears ${matches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= matches.length) {
        return fail(`occurrence ${a.occurrence} out of range (found ${matches.length} match(es)).`);
      }
      const matchEnd = matches[targetIndex] + a.anchorText.length;
      const beforeMatch = before.slice(0, matchEnd);
      const lines = beforeMatch.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const r = applyEdits(relPath, before, [
        { start: { line, column }, end: { line, column }, newText: a.insertText },
      ]);
      return commit(relPath, absPath, before, r, { op: 'insert_after_anchor' }, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_insert_before_anchor',
  {
    title: 'Insert text before an exact anchor',
    description:
      'Insert insertText immediately before the exact anchorText in the file. Unlike coordinate-based ' +
      'atomic_insert_at, this resolves by stable text anchor, avoiding line drift when surrounding ' +
      'code moves. If the anchor appears multiple times, pass occurrence to select the Nth match. ' +
      'Preserves the anchor text exactly; only insertText is added. Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      anchorText: z.string().min(1).describe('exact verbatim text to find and insert before'),
      insertText: z.string().describe('text to insert immediately before the anchor'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const matches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.anchorText, offset)) !== -1) {
        matches.push(offset);
        offset += a.anchorText.length;
      }
      if (matches.length === 0) {
        return fail(`anchor text not found in ${relPath}: ${JSON.stringify(a.anchorText)}`);
      }
      if (matches.length > 1 && a.occurrence === undefined) {
        const lines = matches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `anchor text appears ${matches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= matches.length) {
        return fail(`occurrence ${a.occurrence} out of range (found ${matches.length} match(es)).`);
      }
      const matchPos = matches[targetIndex];
      const beforeMatch = before.slice(0, matchPos);
      const lines = beforeMatch.split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      const r = applyEdits(relPath, before, [
        { start: { line, column }, end: { line, column }, newText: a.insertText },
      ]);
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'insert_before_anchor' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #3b: replace text between two anchors ──
server.registerTool(
  'atomic_replace_between_anchors',
  {
    title: 'Replace text between two anchors',
    description:
      'Replace the text between a start anchor and the next end anchor found after it. ' +
      'Both anchors are preserved; only the text between them is replaced. If the start ' +
      'anchor appears multiple times, pass occurrence to select the Nth match. Supports ' +
      'preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      startAnchorText: z.string().min(1).describe('exact verbatim text of the start anchor'),
      endAnchorText: z
        .string()
        .min(1)
        .describe('exact verbatim text of the end anchor (first occurrence after selected start)'),
      replacementText: z.string().describe('text that replaces everything between the two anchors'),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique match (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const startMatches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.startAnchorText, offset)) !== -1) {
        startMatches.push(offset);
        offset += a.startAnchorText.length;
      }
      if (startMatches.length === 0) {
        return fail(
          `start anchor text not found in ${relPath}: ${JSON.stringify(a.startAnchorText)}`,
        );
      }
      if (startMatches.length > 1 && a.occurrence === undefined) {
        const lines = startMatches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `start anchor text appears ${startMatches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide occurrence to select one.`,
        );
      }
      const targetIndex = a.occurrence === undefined ? 0 : a.occurrence - 1;
      if (targetIndex < 0 || targetIndex >= startMatches.length) {
        return fail(
          `occurrence ${a.occurrence} out of range (found ${startMatches.length} start anchor match(es)).`,
        );
      }
      const startMatchEnd = startMatches[targetIndex] + a.startAnchorText.length;
      const afterStart = before.slice(startMatchEnd);
      const endIndex = afterStart.indexOf(a.endAnchorText);
      if (endIndex === -1) {
        return fail(
          `end anchor text not found after selected start anchor in ${relPath}: ${JSON.stringify(a.endAnchorText)}`,
        );
      }
      const endMatchStart = startMatchEnd + endIndex;
      const startMatchEndLineCol = (() => {
        const beforeMatch = before.slice(0, startMatchEnd);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const endMatchStartLineCol = (() => {
        const beforeMatch = before.slice(0, endMatchStart);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const r = applyEdits(relPath, before, [
        {
          start: startMatchEndLineCol,
          end: endMatchStartLineCol,
          newText: a.replacementText,
        },
      ]);
      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'replace_between_anchors' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

// ── Lever #3c: replace text inside an anchor-delimited region ──
server.registerTool(
  'atomic_replace_text_in_anchor_region',
  {
    title: 'Replace text inside an anchor-delimited region',
    description:
      'Select the Nth region delimited by startAnchorText and the next endAnchorText. ' +
      'Preserve both anchors. Replace oldText only inside the selected region. ' +
      'Refuses ambiguous regions without regionOccurrence and ambiguous oldText matches without textOccurrence. ' +
      'Supports preview + expectedSha256.',
    inputSchema: {
      file: z
        .string()
        .describe(
          'repo-relative to the MCP server root; use an absolute path when operating inside a linked worktree',
        ),
      startAnchorText: z.string().min(1).describe('exact verbatim text of the start anchor'),
      endAnchorText: z
        .string()
        .min(1)
        .describe('exact verbatim text of the end anchor (first occurrence after selected start)'),
      oldText: z
        .string()
        .min(1)
        .describe('exact verbatim text to replace inside the selected region'),
      newText: z.string().describe('replacement text'),
      regionOccurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique region (refuses ambiguity)'),
      textOccurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('1-based; omit to require a unique oldText match in region (refuses ambiguity)'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);

      const startMatches: number[] = [];
      let offset = 0;
      while ((offset = before.indexOf(a.startAnchorText, offset)) !== -1) {
        startMatches.push(offset);
        offset += a.startAnchorText.length;
      }
      if (startMatches.length === 0) {
        return fail(
          `startAnchorText not found in ${relPath}: ${JSON.stringify(a.startAnchorText)}`,
        );
      }
      if (startMatches.length > 1 && a.regionOccurrence === undefined) {
        const lines = startMatches.map((pos) => before.slice(0, pos).split('\n').length);
        return fail(
          `start anchor text appears ${startMatches.length} times in ${relPath} at lines ${lines.join(', ')}. Provide regionOccurrence to select one.`,
        );
      }
      const regionIndex = a.regionOccurrence === undefined ? 0 : a.regionOccurrence - 1;
      if (regionIndex < 0 || regionIndex >= startMatches.length) {
        return fail(
          `regionOccurrence ${a.regionOccurrence} out of range (found ${startMatches.length} region(s)).`,
        );
      }

      const startMatchEnd = startMatches[regionIndex] + a.startAnchorText.length;
      const afterStart = before.slice(startMatchEnd);
      const endIndex = afterStart.indexOf(a.endAnchorText);
      if (endIndex === -1) {
        return fail(
          `endAnchorText not found after selected startAnchorText in ${relPath}: ${JSON.stringify(a.endAnchorText)}`,
        );
      }
      const endMatchStart = startMatchEnd + endIndex;

      const regionText = before.slice(startMatchEnd, endMatchStart);

      const textMatches: number[] = [];
      let tOffset = 0;
      while ((tOffset = regionText.indexOf(a.oldText, tOffset)) !== -1) {
        textMatches.push(tOffset);
        tOffset += a.oldText.length;
      }
      if (textMatches.length === 0) {
        return fail(
          `oldText not found in selected region of ${relPath}: ${JSON.stringify(a.oldText)}`,
        );
      }
      if (textMatches.length > 1 && a.textOccurrence === undefined) {
        return fail(
          `oldText appears ${textMatches.length} times in the selected region of ${relPath}. Provide textOccurrence to select one.`,
        );
      }
      const textIndex = a.textOccurrence === undefined ? 0 : a.textOccurrence - 1;
      if (textIndex < 0 || textIndex >= textMatches.length) {
        return fail(
          `textOccurrence ${a.textOccurrence} out of range (found ${textMatches.length} match(es) in region).`,
        );
      }

      const oldTextAbsStart = startMatchEnd + textMatches[textIndex];
      const oldTextAbsEnd = oldTextAbsStart + a.oldText.length;

      const startPos = (() => {
        const beforeMatch = before.slice(0, oldTextAbsStart);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();
      const endPos = (() => {
        const beforeMatch = before.slice(0, oldTextAbsEnd);
        const lns = beforeMatch.split('\n');
        return { line: lns.length, column: lns[lns.length - 1].length + 1 };
      })();

      const r = applyEdits(relPath, before, [{ start: startPos, end: endPos, newText: a.newText }]);

      return commit(
        relPath,
        absPath,
        before,
        r,
        { op: 'replace_text_in_anchor_region' },
        a.preview ?? false,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
