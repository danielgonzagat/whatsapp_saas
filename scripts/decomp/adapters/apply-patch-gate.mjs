#!/usr/bin/env node
// Adapter for Codex CLI's apply_patch tool. apply_patch input is a unified
// patch envelope, not a {file_path,content} pair, so we parse it and run the
// gate rules against each changed file.
//
// Reads JSON from stdin (Codex hook protocol):
//   { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch ..." } }
//
// Strategy:
//   1. Parse patch headers to get target paths (Update/Add/Delete).
//   2. For Add/Update: collect "+ ..." lines as added content.
//   3. For Delete: block if path is a source file under non-ignored segments
//      (delete-of-tech protection).
//   4. Build a synthetic Claude-shaped envelope per file and reuse the
//      existing gate-rules.mjs.evaluateContent — single source of truth.
//   5. Block (exit 2) on any violation, with stderr describing each.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..', '..');

const { evaluateContent, getLockedFiles, isProtectedPath, isSelfImmutable } =
  await import('../lib/gate-rules.mjs');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function block(messages) {
  const header = '🛑 WORKSPACE GATE BLOCK (apply_patch) — operação rejeitada';
  process.stderr.write(header + '\n' + messages.map((m) => '  • ' + m).join('\n') + '\n');
  process.exit(2);
}

function allow() {
  process.exit(0);
}

const raw = readStdin();
if (!raw) {allow();}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow();
}

const patchText = String(payload?.tool_input?.command ?? payload?.tool_input?.patch ?? '');
if (!patchText) {allow();}

// Parse patch envelope. Format used by Codex (apply_patch):
//   *** Begin Patch
//   *** Update File: path
//   @@ ...
//   -removed
//   +added
//   *** End Patch
// Also: *** Add File: path  /  *** Delete File: path
const lines = patchText.split('\n');
const files = [];
let current = null;

for (const line of lines) {
  const upd = line.match(/^\*\*\* Update File:\s*(.+)$/);
  const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
  const del = line.match(/^\*\*\* Delete File:\s*(.+)$/);
  if (upd) {
    current = { kind: 'update', path: upd[1].trim(), addedLines: [] };
    files.push(current);
    continue;
  }
  if (add) {
    current = { kind: 'add', path: add[1].trim(), addedLines: [] };
    files.push(current);
    continue;
  }
  if (del) {
    files.push({ kind: 'delete', path: del[1].trim(), addedLines: [] });
    current = null;
    continue;
  }
  if (line.startsWith('*** End Patch')) {
    current = null;
    continue;
  }
  if (current && line.startsWith('+') && !line.startsWith('+++')) {
    current.addedLines.push(line.slice(1));
  }
}

if (files.length === 0) {allow();}

const lockedFiles = getLockedFiles(REPO_ROOT);
const violations = [];

for (const f of files) {
  const relPath = f.path.startsWith('/') ? path.relative(REPO_ROOT, f.path) : f.path;

  // Path-level protection (PROTECTED + SELF_IMMUTABLE)
  if (isProtectedPath(relPath)) {
    violations.push('[protected] ' + relPath + ' — somente Daniel pode editar.');
    continue;
  }
  if (isSelfImmutable(relPath)) {
    violations.push('[self-immutable] ' + relPath + ' — sistema de governance, somente Daniel.');
    continue;
  }

  // Delete protection on source files
  if (f.kind === 'delete') {
    const isSource = /\.(?:[cm]?[jt]sx?)$/.test(relPath);
    if (isSource) {
      violations.push('[delete-source] ' + relPath + ' — delete de fonte só via safe-decompose.');
    }
    continue;
  }

  // Content-level checks on added lines (forbidden tokens, line-limit estimate)
  // For "add", added lines == final content. For "update", we approximate:
  //   resulting size = (existing line count) + (added) - (removed). Cheap version:
  //   we evaluate added lines only for forbidden tokens, and total file size for
  //   line-limit (post-patch estimate by reading current size + delta).
  const addedText = f.addedLines.join('\n');
  let estimatedContent = addedText;
  let isNewFile = f.kind === 'add';

  if (f.kind === 'update') {
    const abs = path.join(REPO_ROOT, relPath);
    const cur = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    const removedCount = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
    const curLines = cur.split('\n').length;
    const addedCount = f.addedLines.length;
    const estimatedLines = curLines + addedCount - removedCount;
    estimatedContent = cur + '\n' + addedText; // for token scan only
    // Override line count for evaluateContent by passing synthetic content of
    // the right length. evaluateContent uses split('\n') so we pad.
    if (estimatedLines !== estimatedContent.split('\n').length) {
      estimatedContent = 'x\n'.repeat(Math.max(estimatedLines, 1));
      // BUT we lose token detection — so do token scan separately on added.
    }
    isNewFile = false;
  }

  // First: token scan on the added content (more precise)
  const tokenResult = evaluateContent({
    relPath,
    content: addedText,
    isNewFile: true, // for added-only scan, treat as fresh
    lockedFiles,
  }).filter((v) => v.rule.startsWith('forbidden-token') || v.rule === 'forbidden-directory');
  for (const v of tokenResult) {violations.push('[' + v.rule + '] ' + v.detail);}

  // Then: line-limit check using estimated content
  const sizeResult = evaluateContent({
    relPath,
    content: estimatedContent,
    isNewFile,
    lockedFiles,
  }).filter((v) => v.rule === 'line-limit');
  for (const v of sizeResult) {violations.push('[' + v.rule + '] ' + v.detail);}
}

if (violations.length > 0) {block(violations);}
allow();
