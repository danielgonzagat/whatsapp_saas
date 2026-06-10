import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { replaceText, validate } from './engine.js';
import { guardSha, readUtf8, sha256 } from './server-helpers-io.js';
import { requireNegativeProofForRemovedBytes } from './server-helpers-negative-proof.js';
import { fail, ok } from './server-helpers-result.js';

interface CodexConfigTarget {
  codexHome: string;
  target: string;
}

interface CodexMemoryNoteTarget {
  codexHome: string;
  notesDir: string;
  target: string;
  filename: string;
  relFile: string;
}

interface CodexConfigSnapshot {
  before: string;
  existed: boolean;
  mode?: number;
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function realpathIfPresent(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function codexHomeDir(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : path.join(os.homedir(), '.codex'));
}

const MEMORY_NOTE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MEMORY_NOTE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:Z|[+-]\d{4})$/;
const MEMORY_NOTE_MAX_BYTES = 64 * 1024;

function defaultMemoryNoteTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

function normalizeMemoryNoteSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!MEMORY_NOTE_SLUG_RE.test(slug)) throw new Error('refused: invalid Codex memory note slug');
  return slug;
}

function normalizeMemoryNoteTimestamp(value: string | undefined): string {
  const timestamp = value?.trim() || defaultMemoryNoteTimestamp();
  if (!MEMORY_NOTE_TIMESTAMP_RE.test(timestamp)) throw new Error('refused: invalid Codex memory note timestamp');
  return timestamp;
}

function normalizeMemoryNoteContent(value: string): string {
  const content = value.endsWith('\n') ? value : `${value}\n`;
  if (content.trim().length === 0) throw new Error('refused: Codex memory note content is empty');
  if (content.includes('\0')) throw new Error('refused: Codex memory note content contains NUL bytes');
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MEMORY_NOTE_MAX_BYTES) {
    throw new Error(`refused: Codex memory note content exceeds ${MEMORY_NOTE_MAX_BYTES} bytes`);
  }
  return content;
}

function escapedCodexHome(codexHome: string, target: string): boolean {
  const rel = path.relative(codexHome, target);
  return rel === '' || rel.startsWith('..') || path.isAbsolute(rel);
}

function codexMemoryNoteTarget(slugValue: string, timestampValue?: string): CodexMemoryNoteTarget {
  const codexHome = realpathIfPresent(codexHomeDir());
  const notesDir = path.join(codexHome, 'memories', 'extensions', 'ad_hoc', 'notes');
  const slug = normalizeMemoryNoteSlug(slugValue);
  const timestamp = normalizeMemoryNoteTimestamp(timestampValue);
  const filename = `${timestamp}-${slug}.md`;
  const target = path.join(notesDir, filename);
  if (path.basename(target) !== filename || path.dirname(target) !== notesDir || escapedCodexHome(codexHome, target)) {
    throw new Error('refused: Codex memory note target escaped CODEX_HOME');
  }
  return {
    codexHome,
    notesDir,
    target,
    filename,
    relFile: path.relative(codexHome, target).split(path.sep).join('/'),
  };
}

function codexConfigTarget(): CodexConfigTarget {
  const codexHome = codexHomeDir();
  const target = path.join(codexHome, 'config.toml');
  const realCodexHome = realpathIfPresent(codexHome);
  const realTargetDir = realpathIfPresent(path.dirname(target));
  if (realTargetDir !== realCodexHome) {
    throw new Error('refused: CODEX_HOME/config.toml target escaped CODEX_HOME');
  }
  if (path.basename(target) !== 'config.toml') {
    throw new Error('refused: Codex config target must be config.toml');
  }
  return { codexHome: realCodexHome, target: path.join(realTargetDir, 'config.toml') };
}

function readCodexConfigSnapshot(target: string): CodexConfigSnapshot {
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile()) throw new Error('refused: CODEX_HOME/config.toml is not a regular file');
    return { before: readUtf8(target), existed: true, mode: stat.mode & 0o777 };
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') return { before: '', existed: false };
    throw error;
  }
}

function writeFileAtomically(target: string, content: string, mode: number | undefined): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.atomic-codex-config.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    const options: fs.WriteFileOptions = { encoding: 'utf8', mode: mode ?? 0o600 };
    fs.writeFileSync(tmp, content, options);
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, target);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best-effort temp cleanup */
    }
    throw error;
  }
}

function writeNewFileAtomically(target: string, content: string, mode: number | undefined): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.atomic-codex-memory.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    const options: fs.WriteFileOptions = { encoding: 'utf8', mode: mode ?? 0o600 };
    fs.writeFileSync(tmp, content, options);
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    try {
      fs.linkSync(tmp, target);
    } catch (error) {
      if (errnoCode(error) === 'EEXIST') throw new Error('refused: Codex memory note already exists');
      throw error;
    }
    fs.rmSync(tmp, { force: true });
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best-effort temp cleanup */
    }
    throw error;
  }
}

function rollbackCodexConfig(target: string, snapshot: CodexConfigSnapshot): void {
  if (!snapshot.existed) {
    fs.rmSync(target, { force: true });
    return;
  }
  writeFileAtomically(target, snapshot.before, snapshot.mode);
}

function writeCodexConfigAtomically(
  target: string,
  snapshot: CodexConfigSnapshot,
  after: string,
): void {
  let committed = false;
  try {
    writeFileAtomically(target, after, snapshot.mode);
    committed = true;
    const observed = readUtf8(target);
    if (observed !== after) {
      throw new Error('post-write verification failed: CODEX_HOME/config.toml bytes differ from requested content');
    }
  } catch (error) {
    if (committed) {
      try {
        rollbackCodexConfig(target, snapshot);
      } catch (rollbackError) {
        throw new Error(
          `CODEX_HOME/config.toml write failed and rollback failed: ${
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          }`,
        );
      }
    }
    throw error;
  }
}

function validateCodexTomlShape(before: string, after: string): ReturnType<typeof validate> {
  if (after.includes('\0')) throw new Error('rejected: CODEX_HOME/config.toml contains NUL bytes');
  const validation = validate('config.toml', before, after);
  if (!validation.ok || validation.after > 0) {
    throw new Error(
      `rejected: edit would leave CODEX_HOME/config.toml structurally invalid (${validation.before} -> ${validation.after}). ${
        validation.introduced ?? ''
      }`,
    );
  }
  return validation;
}

function writeCodexMemoryNoteAtomically(targetInfo: CodexMemoryNoteTarget, content: string): string {
  fs.mkdirSync(targetInfo.notesDir, { recursive: true });
  const realNotesDir = fs.realpathSync.native(targetInfo.notesDir);
  if (escapedCodexHome(targetInfo.codexHome, realNotesDir)) {
    throw new Error('refused: Codex memory note target escaped CODEX_HOME');
  }
  const target = path.join(realNotesDir, targetInfo.filename);
  if (path.basename(target) !== targetInfo.filename || path.dirname(target) !== realNotesDir) {
    throw new Error('refused: Codex memory note target escaped CODEX_HOME');
  }
  if (fs.existsSync(target)) throw new Error('refused: Codex memory note already exists');
  writeNewFileAtomically(target, content, 0o600);
  const observed = readUtf8(target);
  if (observed !== content) {
    throw new Error('post-write verification failed: Codex memory note bytes differ from requested content');
  }
  return target;
}

export function registerToolsCodexConfig(server: McpServer): void {
  server.registerTool(
    'atomic_codex_config_replace_text',
    {
      title: 'Atomic Codex config text replacement',
      description:
        'Narrow host-config operator: replaces exact text only in CODEX_HOME/config.toml. It accepts no file path, requires sha256 guards when supplied, validates TOML structural shape, uses same-directory atomic rename, and rolls back on post-write verification failure.',
      inputSchema: {
        oldText: z.string(),
        newText: z.string(),
        occurrence: z.number().int().min(1).optional(),
        expectedSha256: z.string().optional(),
        preview: z.boolean().optional(),
        proofOfIncorrectness: z.string().optional(),
      },
    },
    async (a) => {
      try {
        const { codexHome, target } = codexConfigTarget();
        const snapshot = readCodexConfigSnapshot(target);
        guardSha(snapshot.before, a.expectedSha256);
        const replacement = replaceText('config.toml', snapshot.before, a.oldText, a.newText, a.occurrence);
        const validation = validateCodexTomlShape(snapshot.before, replacement.newText);
        const beforeSha256 = sha256(snapshot.before);
        const afterSha256 = sha256(replacement.newText);
        const negativeActionProof = requireNegativeProofForRemovedBytes({
          action: 'atomic_codex_config_replace_text',
          target: 'CODEX_HOME/config.toml',
          targetUnit: 'file',
          before: snapshot.before,
          after: replacement.newText,
          proofOfIncorrectness: a.proofOfIncorrectness,
          preview: a.preview ?? false,
        });

        if (a.preview) {
          return ok({
            ok: true,
            preview: true,
            changed: false,
            wouldChange: true,
            file: 'CODEX_HOME/config.toml',
            target,
            codexHome,
            beforeSha256,
            afterSha256,
            validation,
            summaryForHuman: 'preview: CODEX_HOME/config.toml replacement validated; file not written',
          });
        }

        writeCodexConfigAtomically(target, snapshot, replacement.newText);
        return ok({
          ok: true,
          changed: true,
          file: 'CODEX_HOME/config.toml',
          target,
          codexHome,
          beforeSha256,
          afterSha256,
          validation,
          negativeActionProof,
          summaryForHuman: 'updated CODEX_HOME/config.toml through atomic_codex_config_replace_text',
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );

  server.registerTool(
    'atomic_codex_memory_note_create',
    {
      title: 'Atomic Codex memory note creation',
      description:
        'Narrow Codex memory operator: creates one new note under CODEX_HOME/memories/extensions/ad_hoc/notes. It accepts no path, validates slug/timestamp/content, refuses overwrite, uses same-directory atomic link, and verifies final bytes.',
      inputSchema: {
        slug: z.string().describe('Short lowercase memory slug; [a-z0-9-], max 81 chars.'),
        content: z.string().describe('Complete note body. A trailing newline is added when absent.'),
        timestamp: z.string().optional().describe('Optional timestamp prefix like 2026-06-09T19-59-41-0300; generated when omitted.'),
        preview: z.boolean().optional(),
      },
    },
    async (a) => {
      try {
        const targetInfo = codexMemoryNoteTarget(a.slug, a.timestamp);
        const content = normalizeMemoryNoteContent(a.content);
        const afterSha256 = sha256(content);
        if (a.preview) {
          return ok({
            ok: true,
            preview: true,
            changed: false,
            wouldChange: true,
            file: `CODEX_HOME/${targetInfo.relFile}`,
            target: targetInfo.target,
            codexHome: targetInfo.codexHome,
            filename: targetInfo.filename,
            bytes: Buffer.byteLength(content, 'utf8'),
            afterSha256,
            summaryForHuman: 'preview: Codex memory note creation validated; file not written',
          });
        }
        const observedTarget = writeCodexMemoryNoteAtomically(targetInfo, content);
        return ok({
          ok: true,
          changed: true,
          file: `CODEX_HOME/${targetInfo.relFile}`,
          target: observedTarget,
          codexHome: targetInfo.codexHome,
          filename: targetInfo.filename,
          bytes: Buffer.byteLength(content, 'utf8'),
          afterSha256,
          summaryForHuman: 'created Codex memory note through atomic_codex_memory_note_create',
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  );
}
