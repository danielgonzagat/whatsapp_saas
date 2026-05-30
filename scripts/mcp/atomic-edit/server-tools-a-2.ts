import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveSafeTarget } from './guard.js';
import { readUtf8 } from './server-helpers-io.js';
import { ok, fail, writeWithTrace } from './server-helpers-result.js';
import { replaceOperator, reorderListItem, changeSignature, replaceBodyKeepSignature, addDecorator, replaceDecorator, moveIntoScope } from './engine-complete.js';

export function registerToolsA2(server: McpServer): void {
// ──────────────────────── v7: complete topology ops ──────────────

server.registerTool('atomic_replace_operator', {
  title: 'Replace binary/logical operator — preserve operands',
  description: 'Replace operator at line:column. Example: if (count < limit) → if (count <= limit).',
  inputSchema: { file: z.string(), line: z.number().int().min(1), column: z.number().int().min(1), newOp: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceOperator(relPath, before, a.line, a.column, a.newOp);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, note: 'operator already matches', file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, oldOp: r.oldOp, newOp: r.newOp });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_operator', r.validation);
    return ok({ ok: true, changed: true, file: relPath, oldOp: r.oldOp, newOp: r.newOp });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_reorder_list', {
  title: 'Move item in comma-separated list — tracked as movement',
  description: 'Move item fromIndex→toIndex in a { } ( ) or [ ] list. Tracked as movement, not delete+create.',
  inputSchema: { file: z.string(), line: z.number().int().min(1), column: z.number().int().min(1), fromIndex: z.number().int().min(0), toIndex: z.number().int().min(0), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = reorderListItem(relPath, before, a.line, a.column, a.fromIndex, a.toIndex);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath, moved: r.moved, fromIndex: r.fromIndex, toIndex: r.toIndex });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_reorder_list', r.validation);
    return ok({ ok: true, changed: true, file: relPath, moved: r.moved, fromIndex: r.fromIndex, toIndex: r.toIndex });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_change_signature', {
  title: 'Change function signature — preserve body',
  description: 'Modes: rename_param, add_param, remove_param, add_return_type. Preserves body byte-exact.',
  inputSchema: { file: z.string(), fnLine: z.number().int().min(1), fnColumn: z.number().int().min(1), mode: z.enum(['rename_param', 'add_param', 'remove_param', 'add_return_type']), paramIndex: z.number().int().min(-1), newValue: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = changeSignature(relPath, before, a.fnLine, a.fnColumn, a.mode, a.paramIndex, a.newValue);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_change_signature', r.validation);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_replace_body', {
  title: 'Replace function body — preserve signature',
  description: 'Swap function/method implementation while keeping signature byte-exact.',
  inputSchema: { file: z.string(), fnLine: z.number().int().min(1), fnColumn: z.number().int().min(1), newBody: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceBodyKeepSignature(relPath, before, a.fnLine, a.fnColumn, a.newBody);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_body', r.validation);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_add_decorator', {
  title: 'Add decorator/annotation before function/method/class',
  description: 'Add @decorator, @Annotation, #[attr] etc. preserving the target.',
  inputSchema: { file: z.string(), targetLine: z.number().int().min(2), decorator: z.string().describe('e.g. "@auth.requires_login" or "@UseGuards(AuthGuard)"'), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = addDecorator(relPath, before, a.targetLine, a.decorator);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_add_decorator', r.validation);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_replace_decorator', {
  title: 'Replace a decorator/annotation — preserve target',
  description: 'Swap decorator on line before target. Finds the matching decorator and replaces it.',
  inputSchema: { file: z.string(), targetLine: z.number().int().min(2), oldDecorator: z.string(), newDecorator: z.string(), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = replaceDecorator(relPath, before, a.targetLine, a.oldDecorator, a.newDecorator);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_replace_decorator', r.validation);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

server.registerTool('atomic_move_into_scope', {
  title: 'Move lines into a scope (if/try/with) — preserve content',
  description: 'Wrap lines startLine..endLine in a new scope. Re-indents preserved content. Example: move lines into try/catch.',
  inputSchema: { file: z.string(), startLine: z.number().int().min(1), endLine: z.number().int().min(1), scopeHeader: z.string().describe('e.g. "if (user != null) {" or "try:"'), scopeFooter: z.string().describe('e.g. "}" or "" for Python'), preview: z.boolean().optional() },
}, async (a) => {
  try {
    const { absPath, relPath } = resolveSafeTarget(a.file);
    const before = readUtf8(absPath);
    const r = moveIntoScope(relPath, before, a.startLine, a.endLine, a.scopeHeader, a.scopeFooter);
    if (!r.validation.ok) return fail('rejected: ' + (r.validation.introduced ?? 'syntax regression'));
    if (r.newText === before) return ok({ ok: true, changed: false, file: relPath });
    if (a.preview ?? false) return ok({ ok: true, preview: true, changed: false, file: relPath });
    writeWithTrace(relPath, absPath, before, r.newText, 'atomic_move_into_scope', r.validation);
    return ok({ ok: true, changed: true, file: relPath });
  } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
});

}
