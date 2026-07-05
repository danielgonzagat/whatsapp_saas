#!/usr/bin/env node
/**
 * opencode-tool-surface-harness.mjs - pure classifier for OpenCode A/B worker
 * tool surfaces. It consumes supplied MCP-list text and JSONL tool names only;
 * it does not inspect filesystem, spawn OpenCode, or trust prompt obedience.
 */

const MCP_NAMES = Object.freeze([
  'chrome-devtools',
  'atomic-edit',
  'codegraph',
  'graphify-plus',
  'saas-compiler',
  'gitnexus',
]);

const ATOMIC_TOOL_PREFIX = 'atomic-edit_';
const ALLOWED_AUXILIARY_TOOLS = Object.freeze([]);
const NATIVE_FORBIDDEN_IN_ATOMIC = Object.freeze([
  'bash',
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'list',
  'task',
  'todowrite',
  'skill',
  'webfetch',
  'websearch',
  'invalid',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseMcpStatus(mcpListText) {
  const text = typeof mcpListText === 'string' ? mcpListText : '';
  const statuses = {};
  for (const name of MCP_NAMES) {
    const line = text.split(/\r?\n/).find((candidate) => candidate.includes(name));
    if (!line) {
      statuses[name] = 'absent';
    } else if (line.includes('connected')) {
      statuses[name] = 'connected';
    } else if (line.includes('disabled')) {
      statuses[name] = 'disabled';
    } else {
      statuses[name] = 'unknown';
    }
  }
  return statuses;
}

function connectedMcps(statuses) {
  return Object.entries(statuses)
    .filter(([, status]) => status === 'connected')
    .map(([name]) => name);
}

function blocker(kind, message, detail = null) {
  return { kind, message, detail };
}

function warning(kind, message, detail = null) {
  return { kind, message, detail };
}

export function classifyOpenCodeToolSurface(input) {
  if (!isRecord(input)) {
    return {
      ok: false,
      blockers: [blocker('INPUT_INVALID', 'input must be an object')],
      warnings: [],
      honestCeiling: HONEST_CEILING,
    };
  }

  const mode = input.mode;
  const toolNames = asArray(input.toolNames).filter((tool) => typeof tool === 'string');
  const statuses = parseMcpStatus(input.mcpListText);
  const connected = connectedMcps(statuses);
  const blockers = [];
  const warnings = [];

  if (mode === 'BLOCK_NO_MCP') {
    if (connected.length > 0) {
      blockers.push(blocker('BLOCK_MCP_CONNECTED', 'BLOCK worker must have zero connected MCP servers', connected));
    }
    const mcpToolsUsed = toolNames.filter((tool) => tool.includes('_') && !ALLOWED_AUXILIARY_TOOLS.includes(tool));
    if (mcpToolsUsed.length > 0) {
      blockers.push(blocker('BLOCK_MCP_TOOL_USED', 'BLOCK worker used MCP-shaped tools', [...new Set(mcpToolsUsed)]));
    }
    const atomicToolsUsed = toolNames.filter((tool) => tool.startsWith(ATOMIC_TOOL_PREFIX));
    if (atomicToolsUsed.length > 0) {
      blockers.push(blocker('BLOCK_ATOMIC_TOOL_USED', 'BLOCK worker used atomic-edit tools', [...new Set(atomicToolsUsed)]));
    }
  } else if (mode === 'ALL_IN_ATOMIC_ONLY') {
    if (statuses['atomic-edit'] !== 'connected') {
      blockers.push(blocker('ATOMIC_MCP_NOT_CONNECTED', 'ALL-IN worker requires atomic-edit connected', statuses['atomic-edit']));
    }
    const nonAtomicConnected = connected.filter((name) => name !== 'atomic-edit');
    if (nonAtomicConnected.length > 0) {
      blockers.push(blocker('NON_ATOMIC_MCP_CONNECTED', 'ALL-IN worker must not have non-atomic MCP servers connected', nonAtomicConnected));
    }
    const nativeForbidden = toolNames.filter((tool) => NATIVE_FORBIDDEN_IN_ATOMIC.includes(tool));
    if (nativeForbidden.length > 0) {
      blockers.push(blocker('ATOMIC_NATIVE_TOOL_USED', 'ALL-IN worker used native read/write/search/exec/planning fallback tools', [...new Set(nativeForbidden)]));
    }
    const foreignMcpTools = toolNames.filter((tool) => tool.includes('_') && !tool.startsWith(ATOMIC_TOOL_PREFIX));
    if (foreignMcpTools.length > 0) {
      blockers.push(blocker('ATOMIC_FOREIGN_MCP_TOOL_USED', 'ALL-IN worker used a non-atomic MCP tool', [...new Set(foreignMcpTools)]));
    }
    const auxiliary = toolNames.filter((tool) => ALLOWED_AUXILIARY_TOOLS.includes(tool));
    if (auxiliary.length > 0) {
      warnings.push(warning('ATOMIC_AUXILIARY_TOOL_USED', 'ALL-IN worker used non-mutating auxiliary tools; measure separately until the harness can disable them', [...new Set(auxiliary)]));
    }
  } else {
    blockers.push(blocker('MODE_INVALID', 'mode must be BLOCK_NO_MCP or ALL_IN_ATOMIC_ONLY', mode ?? null));
  }

  return {
    ok: blockers.length === 0,
    mode,
    statuses,
    connectedMcps: connected,
    toolNames,
    blockers,
    warnings,
    honestCeiling: HONEST_CEILING,
  };
}

export const HONEST_CEILING = 'Pure classifier only. It validates supplied OpenCode MCP-list output and supplied tool names; it does not launch workers, inspect configs, or prove OS-level no-bypass.';

export function runCli(argv = process.argv.slice(2), stdin = '') {
  if (!argv.includes('--classify-opencode-tool-surface')) {
    return {
      ok: false,
      blockers: [blocker('COMMAND_INVALID', 'expected --classify-opencode-tool-surface')],
      warnings: [],
      honestCeiling: HONEST_CEILING,
    };
  }
  let input;
  try {
    input = JSON.parse(stdin || '{}');
  } catch (error) {
    return {
      ok: false,
      blockers: [blocker('JSON_INVALID', error instanceof Error ? error.message : String(error))],
      warnings: [],
      honestCeiling: HONEST_CEILING,
    };
  }
  return classifyOpenCodeToolSurface(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    stdin += chunk;
  });
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), stdin);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
