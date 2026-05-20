'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  runGit, loadTypeScript, relPath, abs, lineCount, readText,
} = require('./atomic-refactor-fastpath.io.cjs');

function listTrackedSources(worktree) {
  return runGit(worktree, ['ls-files', '*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs'])
    .filter((fileName) => !fileName.includes('/node_modules/'))
    .filter((fileName) => !/(^|\.)(spec|test|d)\.[cm]?[jt]sx?$/.test(fileName))
    .filter((fileName) => fs.existsSync(abs(worktree, fileName)));
}

function inferTarget(worktree) {
  const ranked = listTrackedSources(worktree)
    .map((fileName) => ({ file: fileName, lines: lineCount(abs(worktree, fileName)) }))
    .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
  if (ranked.length === 0) throw new Error('could not infer target: no tracked source files found');
  return ranked[0].file;
}

function inferSpec(worktree, target) {
  const ext = path.posix.extname(target);
  const withoutExt = ext ? target.slice(0, -ext.length) : target;
  const candidates = [withoutExt + '.spec' + ext, withoutExt + '.test' + ext];
  return candidates.find((candidate) => fs.existsSync(abs(worktree, candidate))) || null;
}

function inferClassName(file) {
  const text = readText(file);
  const exported = text.match(/export\s+class\s+([A-Za-z_$][\w$]*)/);
  if (exported) return exported[1];
  const local = text.match(/class\s+([A-Za-z_$][\w$]*)/);
  return local ? local[1] : null;
}

function deriveScopePrefix(target) {
  const ext = path.posix.extname(target);
  const withoutExt = ext ? target.slice(0, -ext.length) : target;
  const dir = path.posix.dirname(withoutExt);
  const base = path.posix.basename(withoutExt);
  const pivot = base.lastIndexOf('.');
  const stem = pivot > 0 ? base.slice(0, pivot) : base;
  return dir === '.' ? stem : dir + '/' + stem;
}

function splitName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function symbolInventory(text) {
  const symbols = [];
  const seen = new Set();
  const patterns = [
    /^\s{2}(?:private|protected|public)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^\s*export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  ];
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (ignored.has(name) || seen.has(name)) continue;
      seen.add(name);
      symbols.push(name);
    }
  }
  return symbols;
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function findMatchingBrace(text, openOffset) {
  let depth = 0;
  for (let index = openOffset; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function containsFunctionCall(text, name) {
  const escaped = escapeRegExp(name);
  const memberCall = new RegExp('\\bthis\\s*\\.\\s*' + escaped + '\\s*\\(');
  if (memberCall.test(text)) return true;
  const bareCall = new RegExp('(^|[^A-Za-z0-9_$\\.])' + escaped + '\\s*\\(');
  return bareCall.test(text);
}

function astSymbolSpanInventory(text, fileName, worktree) {
  const ts = loadTypeScript(worktree);
  if (!ts) return null;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const spans = [];
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  const seen = new Set();

  function nameText(node) {
    if (!node) return null;
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
      return node.text;
    }
    return node.getText(source).replace(/^['"]|['"]$/g, '');
  }

  function hasAstModifier(node, kinds) {
    return (node.modifiers || []).some((modifier) => kinds.includes(modifier.kind));
  }

  function pushSpan(name, node, meta = {}) {
    if (!name || ignored.has(name)) return;
    const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    const key = name + ':' + start + ':' + end;
    if (seen.has(key)) return;
    seen.add(key);
    spans.push({
      name,
      startLine: start,
      endLine: end,
      lines: end - start + 1,
      fileHintToken: splitName(name)[0] || name.toLowerCase(),
      isPublicSurface: Boolean(meta.isPublicSurface),
      startOffset: node.getStart(source),
      endOffset: node.getEnd(),
      calls: [],
    });
  }

  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const isPrivate = hasAstModifier(node, [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword]);
      pushSpan(nameText(node.name), node, { isPublicSurface: !isPrivate });
    } else if (ts.isFunctionDeclaration(node)) {
      const isExported = hasAstModifier(node, [ts.SyntaxKind.ExportKeyword]);
      pushSpan(nameText(node.name), node, { isPublicSurface: isExported });
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        pushSpan(nameText(node.name), node, { isPublicSurface: false });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  const names = spans.map((span) => span.name);
  for (const span of spans) {
    const symbolText = text.slice(span.startOffset, span.endOffset);
    span.calls = names.filter((name) => name !== span.name && containsFunctionCall(symbolText, name));
  }
  return spans.sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
}

function symbolSpanInventory(text, fileName, worktree) {
  const astSpans = astSymbolSpanInventory(text, fileName, worktree);
  if (astSpans && astSpans.length > 0) return astSpans;

  const spans = [];
  const pattern = /^\s{2}(?:private|protected|public)?\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{}]+)?\{/gm;
  const ignored = new Set(['constructor', 'if', 'for', 'while', 'switch', 'catch', 'function']);
  for (const match of text.matchAll(pattern)) {
    const name = match[1];
    if (ignored.has(name)) continue;
    const openOffset = match.index + match[0].lastIndexOf('{');
    const closeOffset = findMatchingBrace(text, openOffset);
    if (closeOffset === -1) continue;
    const startLine = lineNumberAt(text, match.index);
    const endLine = lineNumberAt(text, closeOffset);
    spans.push({
      name,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      fileHintToken: splitName(name)[0] || name.toLowerCase(),
    });
  }
  return spans.sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
}

function tokenRelated(left, right) {
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function tokenRelationScore(leftTokens, rightTokens) {
  let score = 0;
  for (const left of leftTokens) {
    for (const right of rightTokens) {
      if (tokenRelated(left, right)) score += 1;
    }
  }
  return score;
}

function fallbackSymbolClusters(symbols, scopePrefix, targetExt) {
  const grouped = new Map();
  for (const symbol of symbols) {
    const tokens = splitName(symbol);
    const key = tokens[0] || 'extracted';
    const current = grouped.get(key) || [];
    current.push({ name: symbol, lines: null, calls: [], isPublicSurface: false });
    grouped.set(key, current);
  }
  return {
    clusters: [...grouped.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .map(([key, members]) => ({
        cluster: key,
        root: key,
        rootLines: null,
        totalObservedLines: null,
        symbols: members.map((member) => member.name),
        memberDetails: members,
        fileHint: scopePrefix + '-' + key + (targetExt || '.ts'),
        assignmentSource: 'name-token-fallback',
      })),
    retainedFacadeSymbols: [],
  };
}


module.exports = {
  listTrackedSources, inferTarget, inferSpec, inferClassName, deriveScopePrefix,
  splitName, symbolInventory, lineNumberAt, findMatchingBrace, escapeRegExp,
  containsFunctionCall, astSymbolSpanInventory, symbolSpanInventory,
  tokenRelated, tokenRelationScore, fallbackSymbolClusters,
};
