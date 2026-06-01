import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveSafeTarget } from './guard.js';
import { addNamedImport, removeNamedImport, replacePropertyValue, renamePropertyKey, addAwaitToCall } from './advanced.js';
import { guardSha, readUtf8 } from './server-helpers-io.js';
import {
  requireNegativeActionProof,
  requireNegativeProofForRemovedBytes,
  removedByteCountBetween,
} from './server-helpers-negative-proof.js';
import { fail } from './server-helpers-result.js';
import { shaArg } from './server-helpers-schema.js';
import { commitSemantic } from './server-helpers-commit-semantic.js';


export function registerToolsE1(server: McpServer): void {
server.registerTool(
  'atomic_add_import',
  {
    title: 'Add a named import (deduped)',
    description:
      "Add `import { name [as alias] } from 'module'` — merges into an existing declaration, creates " +
      "one if absent, no-ops if already present. Syntax-validated, atomic. Solves the thesis's " +
      "'adicionar import sem duplicar'.",
    inputSchema: {
      file: z.string(),
      module: z.string(),
      name: z.string(),
      alias: z.string().optional(),
      typeOnly: z.boolean().optional(),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await addNamedImport(
        relPath,
        before,
        a.module,
        a.name,
        a.alias,
        a.typeOnly ?? false,
      );
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_remove_import',
  {
    title: 'Remove a named import',
    description:
      'Remove a named import by imported-or-local name; drops the whole declaration if it was the last ' +
      'specifier. Syntax-validated, atomic — no dangling commas or broken lines.',
    inputSchema: {
      file: z.string(),
      module: z.string(),
      name: z.string(),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required for non-preview import removal: proof that removed import bytes are non-correct/negative'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await removeNamedImport(relPath, before, a.module, a.name);
      const negativeActionProof = a.preview
        ? undefined
        : requireNegativeActionProof({
            action: 'atomic_remove_import',
            target: `${relPath}:${a.module}:${a.name}`,
            targetUnit: 'import',
            removedByteCount: removedByteCountBetween(before, r.newText),
            proofOfIncorrectness: a.proofOfIncorrectness,
          });
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false, undefined, { negativeActionProof });
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_replace_property_value',
  {
    title: "Replace an object property's value",
    description:
      'Replace the initializer of property `property` with `value` (raw code), optionally scoped to a ' +
      'symbol selector so identically-named properties elsewhere are untouched. Refuses ambiguity. ' +
      'Syntax-validated, atomic.',
    inputSchema: {
      file: z.string(),
      property: z.string(),
      value: z
        .string()
        .describe("replacement initializer source (e.g. 'null', \"'x'\", '{ a: 1 }')"),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when replacement removes bytes: proof that removed bytes are non-correct/negative'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await replacePropertyValue(relPath, before, a.property, a.value, a.selector);
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_replace_property_value',
        target: `${relPath}:${a.property}`,
        targetUnit: 'property-value',
        before,
        after: r.newText,
        proofOfIncorrectness: a.proofOfIncorrectness,
        preview: a.preview ?? false,
      });
      return commitSemantic(
        relPath,
        absPath,
        before,
        r,
        a.preview ?? false,
        undefined,
        negativeActionProof ? { negativeActionProof } : {},
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

server.registerTool(
  'atomic_rename_property_key',
  {
    title: 'Rename an object property key while preserving its value',
    description:
      'Rename object property `property` to `newKey` while preserving its initializer/value exactly. ' +
      'Optional selector scope; refuses ambiguity, missing property, invalid identifiers, and non-assignment forms. ' +
      'Syntax-validated, atomic. Supports preview + expectedSha256.',
    inputSchema: {
      file: z.string(),
      property: z.string(),
      newKey: z.string(),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      proofOfIncorrectness: z
        .string()
        .optional()
        .describe('required when property-key replacement removes bytes: proof that removed bytes are non-correct/negative'),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await renamePropertyKey(relPath, before, a.property, a.newKey, a.selector);
      const negativeActionProof = requireNegativeProofForRemovedBytes({
        action: 'atomic_rename_property_key',
        target: `${relPath}:${a.property}->${a.newKey}`,
        targetUnit: 'property-key',
        before,
        after: r.newText,
        proofOfIncorrectness: a.proofOfIncorrectness,
        preview: a.preview ?? false,
      });
      return commitSemantic(
        relPath,
        absPath,
        before,
        r,
        a.preview ?? false,
        undefined,
        negativeActionProof ? { negativeActionProof } : {},
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);
server.registerTool(
  'atomic_add_await_to_call',
  {
    title: 'Wrap a CallExpression in await (semantic)',
    description:
      'Find a CallExpression by callee name/text and optional selector scope; wrap exactly that ' +
      'call expression as `await <callText>`, preserving callee, arguments, and call text exactly. ' +
      'Refuses missing target, ambiguity, already-awaited call, non-async context, and syntax regression. ' +
      'Supports preview + expectedSha256.',
    inputSchema: {
      file: z.string(),
      callee: z.string().describe('callee expression text to match (e.g. "fetch" or "obj.method")'),
      selector: z.string().optional().describe("scope to this symbol (e.g. 'buildConfig')"),
      ...shaArg,
    },
  },
  async (a) => {
    try {
      const { absPath, relPath } = resolveSafeTarget(a.file);
      const before = readUtf8(absPath);
      guardSha(before, a.expectedSha256);
      const r = await addAwaitToCall(relPath, before, a.callee, a.selector);
      return commitSemantic(relPath, absPath, before, r, a.preview ?? false);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  },
);

}
