/**
 * Read-side structured navigation — CodeStruct's `readCode`, the primitive
 * its ablation identifies as the dominant ACCURACY lever (without it: −7.8pp
 * Pass@1, 7.8× more brittle str_replace calls). Three modes, mirroring the
 * paper:
 *   - browse:   directory -> entries
 *   - outline:  file -> signature summary (no bodies; token-cheap map)
 *   - read:     file + selector -> the complete syntactic unit + its range
 *
 * Returning exact ranges means the agent can chain straight into the atomic
 * edit ops without re-deriving line numbers from a text dump.
 */

import * as fs from "node:fs";
import crypto from "crypto";
import * as path from "node:path";
import * as ts from "typescript";
import { listSignatures, resolveSymbol, resolveNodeAtPosition, type SymbolInfo } from "./symbols.js";
import { universalOutline, universalReadSymbol } from "./engine-universal-nav.js";
import { extToGrammar } from "./engine-universal.js";

const TS_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

function extOf(file: string): string {
  const i = file.lastIndexOf(".");
  return i < 0 ? "" : file.slice(i).toLowerCase();
}

async function sourceFileOf(file: string, text: string) {
  const { Project } = await import("ts-morph");
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  return project.createSourceFile(file, text, { overwrite: true });
}

export interface BrowseEntry {
  name: string;
  type: "dir" | "file";
  /** for files: byte size; for dirs: child count */
  size: number;
}

export function browse(absDir: string): BrowseEntry[] {
  const st = fs.statSync(absDir);
  if (!st.isDirectory()) throw new Error(`not a directory: ${absDir}`);
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((d) => d.name !== "node_modules" && !d.name.startsWith(".git"))
    .map((d) => {
      const p = path.join(absDir, d.name);
      if (d.isDirectory()) {
        let n = 0;
        try {
          n = fs.readdirSync(p).length;
        } catch {
          /* unreadable */
        }
        return { name: d.name, type: "dir" as const, size: n };
      }
      let sz = 0;
      try {
        sz = fs.statSync(p).size;
      } catch {
        /* unreadable */
      }
      return { name: d.name, type: "file" as const, size: sz };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

export interface Outline {
  language: string;
  lineCount: number;
  charCount: number;
  symbols: SymbolInfo[];
}

export async function outline(file: string, text: string): Promise<Outline> {
  const lineCount = text.split("\n").length;
  if (!TS_EXT.has(extOf(file))) {
    const uni = await universalOutline(text, extOf(file));
    return {
      language: uni ? (extToGrammar(extOf(file)) ?? "text") : "text",
      lineCount,
      charCount: text.length,
      symbols: uni ?? [],
    };
  }
  const sf = await sourceFileOf(file, text);
  return {
    language: "ts",
    lineCount,
    charCount: text.length,
    symbols: listSignatures(sf),
  };
}

export interface ReadSymbolResult {
  selector: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  code: string;
  fileSha256?: string;
}

export async function readSymbol(
  file: string,
  text: string,
  selector: string,
  position?: { line: number; column: number },
): Promise<ReadSymbolResult> {
  if (!TS_EXT.has(extOf(file))) {
    const u = await universalReadSymbol(text, selector, extOf(file));
    return { ...u, fileSha256: crypto.createHash("sha256").update(text).digest("hex") };
  }
  const sf = await sourceFileOf(file, text);
  if (position) {
    const resolved = resolveNodeAtPosition(sf, position.line, position.column);
    return {
      selector: `pos:${position.line}:${position.column}`,
      kind: resolved.kind,
      startLine: resolved.startLine,
      startColumn: resolved.startColumn,
      endLine: resolved.endLine,
      endColumn: resolved.endColumn,
      code: resolved.text,
      fileSha256: crypto.createHash('sha256').update(text).digest('hex'),
    };
  }
  const { node, info } = resolveSymbol(sf, selector);
  const start = node.getStart();
  const end = node.getEnd();
  const startLinePos = node.getStartLinePos();
  const endLineStart = text.lastIndexOf("\n", end - 1) + 1;
  return {
    selector: info.selector,
    kind: info.kind,
    startLine: info.startLine,
    startColumn: start - startLinePos + 1,
    endLine: info.endLine,
    endColumn: end - endLineStart + 1,
    code: node.getText(),
    fileSha256: crypto.createHash('sha256').update(text).digest('hex'),
  };
}
