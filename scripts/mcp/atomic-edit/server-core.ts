import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { previewDiff } from "./advanced.js";
import type { ApplyResult, ValidationResult } from "./engine.js";
export const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");
export function guardSha(before: string, expected: string | undefined): void {
  if (expected && sha256(before) !== expected) {
    throw new Error(
      `sha256 mismatch: file changed since you read it (expected ${expected.slice(0, 12)}…, ` +
        `got ${sha256(before).slice(0, 12)}…). Re-read and retry — NOT written.`,
    );
  }
}
export const log = (...a: unknown[]): void => {
  process.stderr.write(`[atomic-edit] ${a.map(String).join(" ")}\n`);
};
export function atomicWrite(absPath: string, content: string): void {
  const dir = path.dirname(absPath);
  const tmp = path.join(dir, `.atomic-edit.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, absPath);
}
export function readUtf8(absPath: string): string {
  if (!fs.existsSync(absPath)) throw new Error(`file does not exist: ${absPath}`);
  const st = fs.statSync(absPath);
  if (!st.isFile()) throw new Error(`not a regular file: ${absPath}`);
  return fs.readFileSync(absPath, "utf8");
}
export interface ToolOk {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [x: string]: unknown;
}
export function ok(payload: Record<string, unknown>): ToolOk {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}
export function fail(message: string): ToolOk {
  log("ERROR", message);
  return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }, null, 2) }], isError: true };
}
export function commit(
  relPath: string,
  absPath: string,
  before: string,
  result: ApplyResult,
  extra: Record<string, unknown> = {},
  preview = false,
): ToolOk {
  const v: ValidationResult = result.validation;
  if (!v.ok) {
    return fail(
      `rejected: edit would introduce a ${v.language} syntax error ` +
        `(${v.before} -> ${v.after}). ${v.introduced ?? ""} — file NOT modified.`,
    );
  }
  if (result.newText === before) {
    return ok({ ok: true, changed: false, note: "edit produced identical content; file untouched", file: relPath });
  }
  if (preview) {
    return ok({
      ok: true,
      preview: true,
      changed: false,
      note: "dry-run: validated, NOT written",
      file: relPath,
      validation: { language: v.language, syntaxErrorsBefore: v.before, syntaxErrorsAfter: v.after },
      intentionChars: result.changedChars,
      expansionFactorAvoided: result.expansionFactor,
      diff: previewDiff(before, result.newText, relPath),
      ...extra,
    });
  }
  atomicWrite(absPath, result.newText);
  log(`wrote ${relPath} (+${result.newText.length - before.length} bytes net)`);
  return ok({
    ok: true,
    changed: true,
    file: relPath,
    validation: { language: v.language, syntaxErrorsBefore: v.before, syntaxErrorsAfter: v.after },
    intentionChars: result.changedChars,
    lineRewriteSurfaceChars: result.lineSurfaceChars,
    expansionFactorAvoided: result.expansionFactor,
    bytesNet: result.newText.length - before.length,
    afterSha256: sha256(result.newText),
    ...extra,
  });
}
