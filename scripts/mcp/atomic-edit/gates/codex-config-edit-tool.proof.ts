import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Check {
  name: string;
  ok: boolean;
  detail: unknown;
}

const jsonMode = process.argv.includes('--json');

function runtimeAtomicRoot(): string {
  const cwd = path.resolve(process.cwd());
  if (fs.existsSync(path.join(cwd, 'server.ts')) && fs.existsSync(path.join(cwd, 'build.mjs'))) {
    return cwd;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.basename(path.resolve(here, '..')) === 'dist'
    ? path.resolve(here, '..', '..')
    : path.resolve(here, '..');
}

const atomicRoot = runtimeAtomicRoot();
const toolSourcePath = path.join(atomicRoot, 'server-tools-codex-config.ts');
const serverPath = path.join(atomicRoot, 'server.ts');
const buildPath = path.join(atomicRoot, 'build.mjs');
const distToolPath = path.join(atomicRoot, 'dist', 'server-tools-codex-config.js');

function read(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function record(results: Check[], name: string, ok: boolean, detail: unknown = null): void {
  results.push({ name, ok: Boolean(ok), detail });
}

const source = read(toolSourcePath);
const server = read(serverPath);
const build = read(buildPath);
const dist = read(distToolPath);
const inputSchema = source.match(/inputSchema:\s*\{([\s\S]*?)\n\s*\},\n\s*\},\n\s*async/)?.[1] ?? '';
const results: Check[] = [];

record(results, 'source-file-exists', source.length > 0, { toolSourcePath });
record(results, 'tool-registered', /server\.registerTool\(\s*['"]atomic_codex_config_replace_text['"]/.test(source));
record(results, 'schema-has-text-operators', /oldText:\s*z\.string\(\)/.test(inputSchema) && /newText:\s*z\.string\(\)/.test(inputSchema), { inputSchema });
record(results, 'schema-has-guards', /expectedSha256:\s*z\.string\(\)\.optional\(\)/.test(inputSchema) && /proofOfIncorrectness:\s*z\.string\(\)\.optional\(\)/.test(inputSchema), { inputSchema });
record(results, 'schema-does-not-accept-user-file', !/\bfile\s*:/.test(inputSchema) && !/targetPath|absPath|path\s*:/.test(inputSchema), { inputSchema });
record(results, 'target-hardwired-to-codex-config', /path\.join\(codexHome, ['"]config\.toml['"]\)/.test(source));
record(results, 'target-escape-refused', /realTargetDir\s*!==\s*realCodexHome/.test(source) && /refused: CODEX_HOME\/config\.toml target escaped CODEX_HOME/.test(source));
record(results, 'direct-atomic-write-is-local-and-rollbacked', /writeCodexConfigAtomically/.test(source) && /rollback/.test(source) && /fs\.renameSync\(tmp, target\)/.test(source));
record(results, 'toml-shape-validated', /validateCodexTomlShape/.test(source) && /validate\(['"]config\.toml['"]/.test(source));
record(results, 'server-imports-tool', /import \{ registerToolsCodexConfig \} from ['"]\.\/server-tools-codex-config\.js['"]/.test(server));
record(results, 'server-registers-tool', /registerToolsCodexConfig\(server\);/.test(server));
record(results, 'build-requires-source-proof', /gates\/codex-config-edit-tool\.proof\.ts/.test(build));
record(results, 'build-requires-dist-artifacts', /server-tools-codex-config\.js/.test(build) && /gates\/codex-config-edit-tool\.proof\.js/.test(build));
record(results, 'compiled-dist-exists', dist.length > 0 && /atomic_codex_config_replace_text/.test(dist), { distToolPath });

const ok = results.every((result) => result.ok);
const payload = { ok, atomicRoot, checks: results };
if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'ok' : 'not ok'} - ${result.name}`);
}
if (!ok) process.exit(1);
