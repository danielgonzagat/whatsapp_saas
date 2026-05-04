import * as path from 'path';
import type { ParsedFunc, SourceFileTarget, BehaviorNodeArtifact } from './types';
import type { DetectedSourceRoot } from '../../source-root-detector';
import type { BehaviorNode } from '../../types.behavior-graph';
import { detectSourceRoots } from '../../source-root-detector';
import { readTextFile, readDir, pathExists } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { SKIP_DIRS, loadTsMorph, nextNodeId } from './patterns';
import { extractFunctionsFromSource } from './parser';
import { determineKind, extractInputs } from './analysis';
import {
  detectStateAccess,
  detectExternalCalls,
  collectSourceExternalContext,
  detectOutputs,
} from './detection';
import { determineRisk, determineExecutionMode, buildValidationRequirements } from './risk';

function extractCalledFunctions(bodyText: string, allFuncNames: Set<string>): string[] {
  const called: string[] = [];
  const seen = new Set<string>();

  const callRegex = /(\w+)\s*\(/g;
  let callMatch: RegExpExecArray | null;
  while ((callMatch = callRegex.exec(bodyText)) !== null) {
    const callee = callMatch[1];
    if (
      allFuncNames.has(callee) &&
      !seen.has(callee) &&
      ![
        'if',
        'for',
        'while',
        'switch',
        'catch',
        'return',
        'throw',
        'new',
        'typeof',
        'instanceof',
      ].includes(callee) &&
      (callee[0] === callee[0].toUpperCase()) === false
    ) {
      seen.add(callee);
      called.push(callee);
    }
  }

  return called;
}

function buildFuncNameMap(functions: ParsedFunc[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const func of functions) {
    const names = map.get(func.name) || [];
    names.push(nextNodeId());
    map.set(func.name, names);
  }
  return map;
}

function collectSourceFiles(rootDir: string): SourceFileTarget[] {
  const files: SourceFileTarget[] = [];

  for (const sourceRoot of detectSourceRoots(rootDir)) {
    const dir = sourceRoot.absolutePath;
    if (!pathExists(dir)) continue;

    const entries = readDir(dir, { recursive: true }) as string[];
    for (const entry of entries) {
      const ext = path.extname(entry);
      if (ext !== '.ts' && ext !== '.tsx' && ext !== '.js' && ext !== '.jsx') continue;

      const normalized = entry.split(path.sep).join('/');
      if (SKIP_DIRS.some((skip) => normalized.includes(skip))) continue;

      files.push({ filePath: safeJoin(dir, entry), sourceRoot });
    }
  }

  return files;
}

function parseFileWithTsMorph(
  filePath: string,
  relPath: string,
  tsMorphAvailable: boolean,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNode[] {
  try {
    let funcs: ParsedFunc[];
    const sourceText = readTextFile(filePath);

    if (tsMorphAvailable) {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    } else {
      funcs = extractFunctionsFromSource(filePath, sourceText);
    }

    return buildNodesFromParsedFunctions(relPath, funcs, sourceText, sourceRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[behavior-graph] Failed to parse ${relPath}: ${message}`);
  }

  return [];
}

function buildNodesFromParsedFunctions(
  relPath: string,
  funcs: ParsedFunc[],
  sourceText: string,
  sourceRoot: DetectedSourceRoot | null,
): BehaviorNodeArtifact[] {
  const sourceContext = collectSourceExternalContext(sourceText, sourceRoot);

  return funcs.map((func) => {
    const kind = determineKind(func, sourceRoot, sourceContext);
    const inputs = extractInputs(func, sourceRoot, sourceContext);
    const stateAccess = detectStateAccess(func.bodyText);
    const externalCalls = detectExternalCalls(func.bodyText, sourceContext);
    const outputs = detectOutputs(func.bodyText, kind);
    const risk = determineRisk(
      kind,
      func.bodyText,
      stateAccess,
      externalCalls,
      func.name,
      func.decorators,
    );
    const executionMode = determineExecutionMode(
      risk,
      kind,
      func.name,
      func.decorators,
      func.bodyText,
      stateAccess,
      externalCalls,
      sourceRoot,
      sourceContext,
    );

    const hasErrorHandler = func.bodyText.includes('try') && func.bodyText.includes('catch');
    const hasLogging =
      func.bodyText.includes('this.logger.') ||
      func.bodyText.includes('console.') ||
      func.bodyText.includes('logger.');
    const lowerBody = func.bodyText.toLowerCase();
    const hasMetrics =
      lowerBody.includes('metrics') ||
      lowerBody.includes('counter') ||
      lowerBody.includes('gauge') ||
      lowerBody.includes('histogram') ||
      lowerBody.includes('increment') ||
      lowerBody.includes('decrement');
    const hasTracing =
      lowerBody.includes('trace') || lowerBody.includes('span') || lowerBody.includes('context.');
    const validationRequirements = buildValidationRequirements(
      risk,
      executionMode,
      stateAccess,
      externalCalls,
      func.bodyText,
    );

    return {
      id: nextNodeId(),
      kind,
      name: func.name,
      filePath: relPath,
      sourceRoot: sourceRoot
        ? {
            relativePath: sourceRoot.relativePath,
            kind: sourceRoot.kind,
            languages: sourceRoot.languages,
            frameworks: sourceRoot.frameworks,
            entrypoints: sourceRoot.entrypoints,
          }
        : undefined,
      line: func.line,
      parentFunctionId: null,
      inputs,
      outputs,
      stateAccess,
      externalCalls,
      risk,
      executionMode,
      calledBy: [],
      calls: [],
      isAsync: func.isAsync,
      hasErrorHandler,
      hasLogging,
      hasMetrics,
      hasTracing,
      decorators: func.decorators,
      docComment: func.docComment,
      validationRequirements,
      governedEvidenceMode:
        executionMode === 'observation_only'
          ? 'read_only_evidence'
          : 'sandboxed_execution_with_validation',
    };
  });
}

export {
  extractCalledFunctions,
  buildFuncNameMap,
  collectSourceFiles,
  parseFileWithTsMorph,
  buildNodesFromParsedFunctions,
};
