#!/usr/bin/env node

import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import {
  listFiles,
  loadApprovalEntries,
  matchesApproval,
  readRepoFile,
  repoRoot,
} from './lib/scan-utils.mjs';

const SCHEMA_PATH = path.join(repoRoot, 'backend', 'prisma', 'schema.prisma');
const SCAN_METHODS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);
const SIMPLE_RE = /\b(?:this\.)?prisma(?:Any)?\.(\w+)\.(\w+)\s*\(/g;
const TX_RE = /\btx\.(\w+)\.(\w+)\s*\(/g;

const approvals = loadApprovalEntries(
  'ops/unsafe-query-exceptions.json',
  'ops/unsafe-query-exceptions.json',
);

if (!existsSync(SCHEMA_PATH)) {
  console.error(`[check-unsafe-queries] Schema Prisma ausente: ${SCHEMA_PATH}`);
  process.exit(1);
}

const scopedModels = loadScopedModels(readFileSync(SCHEMA_PATH, 'utf8'));
const files = listFiles(['backend/src', 'worker'], {
  extensions: ['.ts'],
  changedOnly: true,
  includeTests: false,
});

if (files.length === 0) {
  console.log('[check-unsafe-queries] Nenhum arquivo alterado para auditar.');
  process.exit(0);
}

const findings = [];

for (const file of files) {
  const content = readRepoFile(file);
  for (const finding of [
    ...findPrismaCalls(content, SIMPLE_RE),
    ...findPrismaCalls(content, TX_RE),
  ]) {
    if (!scopedModels.has(finding.model)) {
      continue;
    }
    if (/\bworkspaceId\b/.test(finding.argsBody)) {
      continue;
    }
    if (hasWorkspaceScopedWhereVariable(content, finding)) {
      continue;
    }
    if (
      matchesApproval(approvals, file, 'unsafeQuery', (entry) => {
        if (typeof entry.line === 'number' && entry.line !== finding.line) {
          return false;
        }
        if (entry.model && entry.model !== finding.model) {
          return false;
        }
        if (entry.method && entry.method !== finding.method) {
          return false;
        }
        return true;
      })
    ) {
      continue;
    }
    findings.push(
      `${file}:${finding.line} prisma.${finding.model}.${finding.method} sem workspaceId`,
    );
  }
}

if (findings.length > 0) {
  console.error('[check-unsafe-queries] Queries multi-tenant sem workspaceId detectadas:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`[check-unsafe-queries] OK — ${files.length} arquivo(s) auditado(s).`);

function loadScopedModels(schema) {
  const scoped = new Set();
  const blocks = schema.split(/\n(?=model \w+ \{)/);
  for (const block of blocks) {
    const match = block.match(/^model (\w+)/);
    if (!match) {
      continue;
    }
    if (!/\bworkspaceId\s+String\b/.test(block)) {
      continue;
    }
    const name = match[1];
    scoped.add(name.charAt(0).toLowerCase() + name.slice(1));
  }
  return scoped;
}

function findPrismaCalls(source, pattern) {
  const findings = [];
  for (const match of source.matchAll(pattern)) {
    const model = match[1];
    const method = match[2];
    if (!SCAN_METHODS.has(method)) {
      continue;
    }
    const start = match.index ?? 0;
    const argsBlock = extractObjectLiteral(source, start + match[0].length - 1);
    findings.push({
      model,
      method,
      start,
      line: source.slice(0, start).split('\n').length,
      argsBody: argsBlock?.body ?? '',
    });
  }
  return findings;
}

function hasWorkspaceScopedWhereVariable(source, finding) {
  const whereVariableNames = extractWhereVariableNames(finding.argsBody);
  if (whereVariableNames.length === 0) {
    return false;
  }

  const sourceBeforeCall = source.slice(0, finding.start);
  return whereVariableNames.some((name) =>
    variableObjectContainsWorkspaceId(sourceBeforeCall, name),
  );
}

function extractWhereVariableNames(argsBody) {
  const names = new Set();

  for (const match of argsBody.matchAll(/\bwhere\s*:\s*(\w+)/g)) {
    names.add(match[1]);
  }

  if (/\bwhere\b\s*[,}]/.test(argsBody)) {
    names.add('where');
  }

  return Array.from(names);
}

function variableObjectContainsWorkspaceId(source, variableName) {
  const declaration = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRegex(variableName)}(?:\\s*:\\s*[^=]+)?\\s*=`,
    'g',
  );
  const matches = Array.from(source.matchAll(declaration));
  const lastMatch = matches.at(-1);
  if (!lastMatch || typeof lastMatch.index !== 'number') {
    return false;
  }

  const objectLiteral = extractObjectLiteral(source, lastMatch.index + lastMatch[0].length);
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: literal \b anchored regex applied to repo TypeScript source read from readRepoFile (tracked files only). No user input, no nested quantifiers.
  return /\bworkspaceId\b/.test(objectLiteral?.body ?? '');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractObjectLiteral(source, startIdx) {
  let index = source.indexOf('{', startIdx);
  if (index === -1) {
    return null;
  }

  const open = index;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (; index < source.length; index += 1) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : '';

    if (inSingle) {
      if (char === "'" && prev !== '\\') inSingle = false;
      continue;
    }
    if (inDouble) {
      if (char === '"' && prev !== '\\') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (char === '`' && prev !== '\\') inTemplate = false;
      continue;
    }

    if (char === "'") inSingle = true;
    else if (char === '"') inDouble = true;
    else if (char === '`') inTemplate = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { body: source.slice(open, index + 1) };
      }
    }
  }

  return null;
}
