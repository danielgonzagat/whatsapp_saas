'use strict';

const fs = require('node:fs');
const path = require('node:path');

function fileHasNamedImport(file, importNames, importModule) {
  if (Array.isArray(importNames) && importNames.length === 0) return true;
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    if (match[2] !== importModule) continue;
    const importedNames = new Set(
      match[1]
        .split(',')
        .map((entry) => entry.trim().split(/\s+as\s+/i)[0].trim())
        .filter(Boolean),
    );
    if (importNames.every((name) => importedNames.has(name))) return true;
  }
  return false;
}

function escapeRegExp(value) {
  return String(value).replace(/[-\/\^$*+?.()|[\]{}]/g, '\\$&');
}

function parseToolArgs(tool, raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('@')) {
    const file = normalizePathValue(trimmed.slice(1), 'argsFile');
    return parseCliJson(fs.readFileSync(file, 'utf8'));
  }
  try {
    return parseCliJson(raw);
  } catch (error) {
    if ((tool === 'code_outline' || tool === 'code_file_stat') && trimmed && !/^[{[]/.test(trimmed)) {
      return { file: trimmed };
    }
    throw error;
  }
}

function methodNameFromSelector(selector) {
  const parts = String(selector).split('.');
  return parts[parts.length - 1];
}

function classMethodSelectors(className, methodsOrSelectors) {
  if (!className) return methodsOrSelectors;
  return methodsOrSelectors.map((entry) => String(entry).includes('.') ? String(entry) : className + '.' + entry);
}

function decodeEscapedCodeText(value) {
  return String(value)
    .split('\\r\\n')
    .join('\n')
    .split('\\n')
    .join('\n')
    .split('\\t')
    .join('\t');
}

function replacementEscapesEnabled(scope = {}, replacement = {}) {
  if (replacement.preserveEscapedCodeText === true || scope.preserveEscapedCodeTextInReplacements === true) {
    return false;
  }
  return (
    replacement.decodeEscapedCodeText === true ||
    replacement.decodeEscapedNewlines === true ||
    scope.decodeEscapedCodeTextInReplacements === true ||
    scope.decodeEscapedNewlinesInReplacements === true
  );
}

function dependencyInlineObjectText(scope = {}, indent = '') {
  const container = scope.dependencyContainer || scope.depsContainer;
  const entries = dependencyContainerEntries(container);
  if (!entries.length) {
    throw new Error('dependencyInlineObject placeholder requires dependencyContainer entries');
  }
  const innerIndent = `${indent}  `;
  return [
    '{',
    ...entries.map(([key, value]) => `${innerIndent}${key}: ${value},`),
    `${indent}}`,
  ].join('\n');
}

function replacementText(scope, replacement) {
  const raw = replacement.newText ?? replacement.new;
  if (typeof raw !== 'string') return raw;
  const text = replacementEscapesEnabled(scope, replacement) ? decodeEscapedCodeText(raw) : raw;
  if (!text.includes('{{dependencyInlineObject}}')) return text;
  return text.split('{{dependencyInlineObject}}').join(
    dependencyInlineObjectText(scope, replacement.dependencyIndent || ''),
  );
}

function explicitThisAssignmentNames(replacements = []) {
  const names = new Set();
  if (!Array.isArray(replacements)) return names;
  for (const replacement of replacements) {
    const text = replacementText({}, replacement);
    if (typeof text !== 'string') continue;
    for (const match of text.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:\s*this\.[A-Za-z_$][\w$]*\s*,?\s*$/gm)) {
      names.add(match[1]);
    }
  }
  return names;
}

function normalizeOptionalDepsForExplicitAssignments(header, replacements = []) {
  const assignedNames = explicitThisAssignmentNames(replacements);
  if (!assignedNames.size) return header;
  let normalized = String(header);
  for (const name of assignedNames) {
    const pattern = new RegExp('(\\n\\s*)' + escapeRegExp(name) + '\\?:\\s*([^;\\n]+);', 'g');
    normalized = normalized.replace(pattern, (match, prefix, typeText) => {
      const type = String(typeText).trim();
      if (/\bundefined\b/.test(type)) return prefix + name + ': ' + type + ';';
      return prefix + name + ': ' + type + ' | undefined;';
    });
  }
  return normalized;
}

function dependencyContainerEntries(container) {
  const entries = container && container.entries;
  if (Array.isArray(entries)) {
    return entries.map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) return [String(entry[0]), String(entry[1])];
      if (entry && typeof entry === 'object') return [String(entry.name || entry.key), String(entry.value)];
      return ['', ''];
    }).filter(([key, value]) => key && value && key !== 'undefined' && value !== 'undefined');
  }
  if (entries && typeof entries === 'object') {
    return Object.entries(entries).map(([key, value]) => [key, String(value)]);
  }
  return [];
}

function buildDependencyGetterReplacement(container) {
  const name = container && container.name;
  const typeName = container && container.typeName;
  const marker = container && (container.insertBeforeClassEndMarker || container.oldText);
  const entries = dependencyContainerEntries(container);
  if (typeof name !== 'string' || !name || typeof typeName !== 'string' || !typeName || typeof marker !== 'string' || !marker || !entries.length) {
    throw new Error('dependencyContainer getter requires name, typeName, entries and insertBeforeClassEndMarker/oldText');
  }
  const getter = [
    `  private get ${name}(): ${typeName} {`,
    '    return {',
    ...entries.map(([key, value]) => `      ${key}: ${value},`),
    '    };',
    '  }',
  ].join('\n');
  const firstMarkerLine = marker.split('\n').find((line) => line.trim());
  return {
    anchorText: container.anchorText || firstMarkerLine || marker,
    newTextPrefix: `${getter}\n\n`,
    expectedCount: container.expectedCount ?? 1,
  };
}

function dependencyContainerPropertyAnchors(container) {
  const declarationAnchor = container.declarationInsertAfter || container.propertyDeclarationAfter || container.declarationAfter;
  const assignmentAnchor = container.constructorAssignmentInsertAfter || container.assignmentInsertAfter || container.constructorAssignmentAfter;
  return { declarationAnchor, assignmentAnchor };
}

function buildDependencyConstructorPropertyReplacements(container) {
  const name = container && container.name;
  const typeName = container && container.typeName;
  const entries = dependencyContainerEntries(container);
  const { declarationAnchor, assignmentAnchor } = dependencyContainerPropertyAnchors(container || {});
  if (typeof name !== 'string' || !name || typeof typeName !== 'string' || !typeName || !entries.length) {
    throw new Error('dependencyContainer constructorProperty requires name, typeName and entries');
  }
  if (typeof declarationAnchor !== 'string' || !declarationAnchor || typeof assignmentAnchor !== 'string' || !assignmentAnchor) {
    throw new Error('dependencyContainer constructorProperty requires declarationInsertAfter and constructorAssignmentInsertAfter');
  }
  const declaration = `  private readonly ${name}: ${typeName};`;
  const assignment = [
    `    this.${name} = {`,
    ...entries.map(([key, value]) => `      ${key}: ${value},`),
    '    };',
  ].join('\n');
  return [
    {
      oldText: declarationAnchor,
      newText: `${declarationAnchor}\n${declaration}`,
      expectedCount: container.declarationExpectedCount ?? container.expectedCount ?? 1,
    },
    {
      oldText: assignmentAnchor,
      newText: `${assignmentAnchor}\n\n${assignment}`,
      expectedCount: container.assignmentExpectedCount ?? container.expectedCount ?? 1,
    },
  ];
}

function resolveAnchoredTailReplacement(file, replacement, scope) {
  if (typeof replacement.anchorText !== 'string' || typeof replacement.newTextPrefix !== 'string') {
    return {
      oldText: replacement.oldText,
      newText: replacementText(scope, replacement),
    };
  }
  const source = fs.readFileSync(file, 'utf8');
  const index = source.lastIndexOf(replacement.anchorText);
  if (index === -1) {
    throw new Error('anchored replacement marker not found: ' + replacement.anchorText);
  }
  const oldText = source.slice(index);
  return {
    oldText,
    newText: replacement.newTextPrefix + oldText,
  };
}

function buildGeneratedPostRemovalReplacements(args = {}) {
  const container = args.dependencyContainer || args.depsContainer;
  if (!container || typeof container !== 'object') return [];
  const style = container.style || 'getter';
  if (style === 'getter') {
    return [buildDependencyGetterReplacement(container)];
  }
  if (style === 'constructorProperty' || style === 'constructor-property' || style === 'property') {
    return buildDependencyConstructorPropertyReplacements(container);
  }
  if (style === 'inlineObject' || style === 'inline-object' || style === 'inline') {
    return [];
  }
  throw new Error('dependencyContainer supports style=getter, style=constructorProperty or style=inlineObject');
}

function normalizeMethodBodyReplacements(adapter = {}) {
  const replacements = adapter.bodyReplacements || adapter.replacements || [];
  if (Array.isArray(replacements)) {
    return replacements
      .map((entry) => ({ oldText: entry.oldText ?? entry.old, newText: replacementText(adapter, entry) }))
      .filter((entry) => typeof entry.oldText === 'string' && typeof entry.newText === 'string');
  }
  if (replacements && typeof replacements === 'object') {
    return Object.entries(replacements).map(([oldText, newText]) => ({
      oldText,
      newText: replacementText(adapter, { newText: String(newText) }),
    }));
  }
  return [];
}

function methodExtractionAdapter(args, name, selector) {
  const adapters = args && args.methodAdapters && typeof args.methodAdapters === 'object'
    ? args.methodAdapters
    : {};
  return adapters[name] || adapters[selector] || args.methodAdapter || {};
}

function classMethodToExportedFunction(methodCode, expectedName, adapter = {}) {
  let code = String(methodCode || '').trimEnd();
  code = code.replace(/^(?:private|public|protected)\s+/, '');
  code = code.replace(/^async\s+([A-Za-z_$][\w$]*)\s*\(/, 'export async function $1(');
  code = code.replace(/^([A-Za-z_$][\w$]*)\s*\(/, 'export function $1(');
  const namePattern = new RegExp('^export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(expectedName) + '\\s*\\(');
  if (!namePattern.test(code)) {
    throw new Error('could not convert class method ' + expectedName + ' to exported function');
  }
  code = code
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.startsWith('  ') ? line.slice(2) : line))
    .join('\n');
  if (adapter.signaturePrefixParam) {
    const signaturePattern = new RegExp('^(export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(expectedName) + '\\s*\\()');
    code = code.replace(signaturePattern, '$1' + adapter.signaturePrefixParam);
  }
  for (const replacement of normalizeMethodBodyReplacements(adapter)) {
    code = code.split(replacement.oldText).join(replacement.newText);
  }
  return code;
}

function fileHasExportedFunctions(file, names) {
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  return names.every((name) => new RegExp('export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(name) + '\\s*\\(').test(source));
}

function fileContainsNone(file, texts) {
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  return texts.every((text) => !source.includes(text));
}

function repoRelativeFromCwd(file, cwd) {
  const absFile = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const absCwd = path.isAbsolute(cwd) ? cwd : path.resolve(process.cwd(), cwd);
  return path.relative(absCwd, absFile).split(path.sep).join('/');
}

function normalizeLintFixArgs(args, sourceFile, targetFile) {
  const enabled = args.formatWithEslint === true || args.lintFix === true || args.autoFixLint === true;
  if (!enabled) return null;
  const cwd = typeof args.eslintCwd === 'string' ? args.eslintCwd : 'backend';
  const formatOnly = args.formatWithEslint === true && args.lintFix !== true && args.autoFixLint !== true;
  const defaultEslintArgs = [
    repoRelativeFromCwd(sourceFile, cwd),
    repoRelativeFromCwd(targetFile, cwd),
    '--fix-dry-run',
    ...(formatOnly ? ['--fix-type', 'layout'] : []),
    '--format',
    'json',
  ];
  const eslintArgs = Array.isArray(args.eslintArgs) && args.eslintArgs.length
    ? args.eslintArgs
    : defaultEslintArgs;
  const allowedPaths = Array.isArray(args.lintAllowedPaths) && args.lintAllowedPaths.length
    ? args.lintAllowedPaths
    : [sourceFile, targetFile];
  return { cwd, args: eslintArgs, allowedPaths, applyKnownResidueFixes: false };
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

module.exports = {
  fileHasNamedImport,
  escapeRegExp,
  parseToolArgs,
  methodNameFromSelector,
  classMethodSelectors,
  decodeEscapedCodeText,
  replacementEscapesEnabled,
  dependencyInlineObjectText,
  replacementText,
  explicitThisAssignmentNames,
  normalizeOptionalDepsForExplicitAssignments,
  dependencyContainerEntries,
  buildDependencyGetterReplacement,
  dependencyContainerPropertyAnchors,
  buildDependencyConstructorPropertyReplacements,
  resolveAnchoredTailReplacement,
  buildGeneratedPostRemovalReplacements,
  normalizeMethodBodyReplacements,
  methodExtractionAdapter,
  classMethodToExportedFunction,
  fileHasExportedFunctions,
  fileContainsNone,
  repoRelativeFromCwd,
  normalizeLintFixArgs,
  countOccurrences,
};
