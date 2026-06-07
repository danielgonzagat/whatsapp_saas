import * as ts from 'typescript';
import { validate, type ValidationResult } from './engine.js';
import { resolveSymbol } from './symbols.js';

export type SymbolOp = 'replace' | 'insert_after' | 'remove';

export interface SymbolEditResult {
  newText: string;
  validation: ValidationResult;
  selector: string;
  op: SymbolOp;
  startLine: number;
  endLine: number;
}

function leadingIndent(text: string, atOffset: number): string {
  const lineStart = text.lastIndexOf('\n', atOffset - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, atOffset + 200));
  return match ? match[0] : '';
}

function reindent(code: string, indent: string): string {
  if (indent === '') return code;
  const lines = code.split('\n');
  if (lines.length === 1) return code;
  return lines.map((line, index) => (index === 0 || line === '' ? line : indent + line)).join('\n');
}

export async function editSymbol(
  file: string,
  original: string,
  selector: string,
  op: SymbolOp,
  code?: string,
): Promise<SymbolEditResult> {
  const { Project, Node } = await import('ts-morph');
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true },
  });
  const sourceFile = project.createSourceFile(file, original, { overwrite: true });
  const { node, info } = resolveSymbol(sourceFile, selector);
  const start = node.getStart();
  const end = node.getEnd();
  const indent = leadingIndent(original, start);

  let next: string;
  if (op === 'remove') {
    let removalStart = start;
    let removalEnd = end;
    if (Node.isVariableDeclaration(node)) {
      const statement = node.getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);
      if (statement) {
        const declarations = statement.getDeclarations();
        if (declarations.length === 1) {
          removalStart = statement.getStart();
          removalEnd = statement.getEnd();
        } else {
          const index = declarations.findIndex((declaration) => declaration === node);
          const neighbor = declarations[index === 0 ? 1 : index - 1];
          if (neighbor) {
            if (index === 0) removalEnd = neighbor.getStart();
            else if (index > 0) removalStart = neighbor.getEnd();
          }
        }
      }
    }
    const lineStart = original.lastIndexOf('\n', removalStart - 1) + 1;
    const cutStart = original.slice(lineStart, removalStart).trim() === '' ? lineStart : removalStart;
    let cutEnd = removalEnd;
    if (original[cutEnd] === '\n') cutEnd++;
    next = original.slice(0, cutStart) + original.slice(cutEnd);
  } else if (op === 'replace') {
    if (code == null) throw new Error('op "replace" requires code');
    next = original.slice(0, start) + reindent(code, indent) + original.slice(end);
  } else {
    if (code == null) throw new Error('op "insert_after" requires code');
    next = `${original.slice(0, end)}\n\n${indent}${reindent(code, indent)}${original.slice(end)}`;
  }

  return {
    newText: next,
    validation: validate(file, original, next),
    selector: info.selector,
    op,
    startLine: info.startLine,
    endLine: info.endLine,
  };
}
