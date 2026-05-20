'use strict';

const path = require('node:path');

function usage(exitCode = 2) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write('Usage: atomic-call.cjs <tool-name|batch|validate_kloel_unified_agent|extract_symbol_to_file|extract_class_methods_to_file|replace_file_with_current_anchor> <json-arguments|json-operations-array>\n');
  process.exit(exitCode);
}

function parseCliJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    const trimmed = String(raw || '').trim();
    if (/^[{[]/.test(trimmed) && trimmed.includes('\\\"')) {
      try {
        return JSON.parse(trimmed.replace(/\\"/g, '"'));
      } catch {
        // Preserve the original parse failure; it points at the user-supplied argument.
      }
    }
    throw firstError;
  }
}

function normalizePathValue(value, key) {
  if (typeof value !== 'string') return value;
  const cwd = process.cwd();
  const abs = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  const cwdPrefix = `${cwd}${path.sep}`;
  if (abs !== cwd && !abs.startsWith(cwdPrefix)) {
    throw new Error(`refused: ${key} escapes current worktree: ${value}`);
  }
  return abs;
}

function normalizeToolAliases(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  if (tool === 'code_read_symbol' && Object.prototype.hasOwnProperty.call(args, 'specifier') && !Object.prototype.hasOwnProperty.call(args, 'selector')) {
    args.selector = args.specifier;
    delete args.specifier;
  }
  if (tool === 'atomic_add_import') {
    if (Object.prototype.hasOwnProperty.call(args, 'specifier') && !Object.prototype.hasOwnProperty.call(args, 'module')) {
      args.module = args.specifier;
    }
    delete args.specifier;
    if (Object.prototype.hasOwnProperty.call(args, 'importName') && !Object.prototype.hasOwnProperty.call(args, 'name')) {
      args.name = args.importName;
    }
    delete args.importName;
  }
  if (tool === 'atomic_create_file') {
    delete args.expectedSha256;
  }
}

function normalizeWorktreeSafePaths(value, parentKey = '') {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((item, index) => normalizeWorktreeSafePaths(item, `${parentKey}[${index}]`));
    return value;
  }
  for (const [alias, canonical] of ARG_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(value, alias) && !Object.prototype.hasOwnProperty.call(value, canonical)) {
      value[canonical] = value[alias];
    }
    delete value[alias];
  }
  for (const [key, child] of Object.entries(value)) {
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    if (PATH_KEYS.has(key)) {
      value[key] = normalizePathValue(child, fullKey);
      continue;
    }
    if (PATH_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(child)) {
        throw new Error(`refused: ${fullKey} must be an array of paths`);
      }
      child.forEach((entry, index) => {
        child[index] = normalizePathValue(entry, `${fullKey}[${index}]`);
      });
      continue;
    }
    normalizeWorktreeSafePaths(child, fullKey);
  }
  return value;
}

function trimCommandOutput(value, max = 1200) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n...<trimmed>...\n${text.slice(-half)}`;
}

function optionalPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

module.exports = {
  usage,
  parseCliJson,
  normalizePathValue,
  normalizeToolAliases,
  normalizeWorktreeSafePaths,
  trimCommandOutput,
  optionalPositiveNumber,
};
