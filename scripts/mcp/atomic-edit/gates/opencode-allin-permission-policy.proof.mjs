#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(sourceDir, 'opencode-allin-atomic-only.config.json');
const launcherFile = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');

const REQUIRED_NATIVE_DENIES = [
  'bash',
  'read',
  'edit',
  'write',
  'apply_patch',
  'grep',
  'glob',
  'lsp',
  'skill',
  'task',
  'todowrite',
  'webfetch',
  'websearch',
  'question',
];

const ALLOWED_ATOMIC_PATTERNS = [
  'atomic-edit_*',
  'atomic_edit_*',
  'atomic_*',
  'code_*',
  'chrome_devtools_*',
];

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function stringPermissionEntries(permission) {
  return Object.entries(permission).filter(([, value]) => typeof value === 'string');
}

function main() {
  const results = [];
  const config = readConfig();
  const permission = config.permission && typeof config.permission === 'object' ? config.permission : null;
  const mcp = config.mcp && typeof config.mcp === 'object' ? config.mcp : null;
  const mcpKeys = mcp ? Object.keys(mcp) : [];
  const atomicServer = mcp?.['atomic-edit'];

  record(results, 'OpenCode config parses as an object', config && typeof config === 'object' && !Array.isArray(config), {
    configFile,
  });
  record(results, 'config disables OpenCode autoupdate/snapshot drift for reproducible A/B runs', config.autoupdate === false && config.snapshot === false, {
    autoupdate: config.autoupdate,
    snapshot: config.snapshot,
  });
  record(results, 'exactly one MCP server is configured', mcpKeys.length === 1 && mcpKeys[0] === 'atomic-edit', { mcpKeys });
  record(results, 'atomic-edit MCP server is local and enabled', atomicServer?.type === 'local' && atomicServer?.enabled === true, atomicServer);
  record(
    results,
    'atomic-edit MCP server uses the repository launcher only',
    Array.isArray(atomicServer?.command) &&
      atomicServer.command.length === 2 &&
      atomicServer.command[0] === 'bash' &&
      atomicServer.command[1] === launcherFile &&
      fs.existsSync(launcherFile),
    { command: atomicServer?.command, launcherFile, launcherExists: fs.existsSync(launcherFile) },
  );

  record(results, 'permission policy is deny-by-default', permission?.['*'] === 'deny', permission);
  record(
    results,
    'native OpenCode read/edit/search/exec/planner/network tools are explicitly denied',
    Boolean(permission) && REQUIRED_NATIVE_DENIES.every((name) => permission[name] === 'deny'),
    Object.fromEntries(REQUIRED_NATIVE_DENIES.map((name) => [name, permission?.[name]])),
  );
  record(
    results,
    'only Atomic MCP tool-name patterns are explicitly allowed',
    Boolean(permission) &&
      ALLOWED_ATOMIC_PATTERNS.every((name) => permission[name] === 'allow') &&
      stringPermissionEntries(permission).every(([name, value]) =>
        value !== 'allow' || ALLOWED_ATOMIC_PATTERNS.includes(name),
      ),
    stringPermissionEntries(permission),
  );
  record(
    results,
    'external directory access is denied by wildcard',
    permission?.external_directory &&
      typeof permission.external_directory === 'object' &&
      !Array.isArray(permission.external_directory) &&
      Object.keys(permission.external_directory).length === 1 &&
      permission.external_directory['*'] === 'deny',
    permission?.external_directory,
  );
  record(
    results,
    'policy contains no ask approvals and no non-atomic allow strings',
    Boolean(permission) &&
      JSON.stringify(permission).includes('"ask"') === false &&
      stringPermissionEntries(permission).every(([name, value]) =>
        value === 'deny' || (value === 'allow' && ALLOWED_ATOMIC_PATTERNS.includes(name)),
      ),
    stringPermissionEntries(permission),
  );

  return { ok: results.every((entry) => entry.ok), configFile, results };
}

const payload = main();
if (jsonMode) console.log(JSON.stringify(payload, null, 2));
else if (!payload.ok) console.error(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 1);
