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
}
