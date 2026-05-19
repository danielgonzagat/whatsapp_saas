#!/usr/bin/env node
/**
 * build-skeleton.mjs — Empacota o ESQUELETO portável do vault Obsidian do HUD KLOEL.
 *
 * Roda na máquina do DONO (que tem o vault vivo). Gera um .tar.gz contendo só o
 * que é estrutural/portável — sem o espelho de 123 MB (regenera sozinho), sem
 * layout de janelas da máquina, e sem segredos (chave do Local REST API).
 *
 * O amigo extrai esse tarball com bootstrap.sh; o mirror daemon dele reconstrói
 * o _source a partir do código na máquina dele.
 *
 * Uso:
 *   node tools/hud-portable/build-skeleton.mjs
 *   KLOEL_VAULT_ROOT="/caminho/do/vault" node tools/hud-portable/build-skeleton.mjs
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const BUNDLE_NAME = 'Kloel-HUD-Vault';
const OUT_TARBALL = join(HERE, 'kloel-obsidian-hud-skeleton.tar.gz');

if (!existsSync(VAULT_ROOT)) {
  console.error(`[build-skeleton] vault não encontrado: ${VAULT_ROOT}`);
  console.error('Defina KLOEL_VAULT_ROOT apontando para o vault Obsidian vivo.');
  process.exit(1);
}

/** Caminhos (relativos ao vault) que NUNCA entram no esqueleto. */
const EXCLUDE_PREFIXES = [
  '.obsidian/backups',
  '.obsidian/workspace.json', // layout de painéis da máquina — Obsidian recria
  '.obsidian/workspace-mobile.json',
  '.obsidian/graph 2.json',
  '.obsidian/graph 3.json',
  '.obsidian/graph 4.json',
  '.obsidian/graph 5.json',
  '.obsidian/graph.before-static-render-fix-2026-05-01.json',
  '.obsidian/graph-snapshot.png',
  '.smart-env', // cache de embeddings do smart-connections (regenera)
  '.trash',
  '.git',
  `Kloel${sep}99 - Espelho do Codigo${sep}_source`, // 123 MB — mirror daemon regenera
  `Kloel${sep}.backups`,
  `Kloel${sep}.codex-backups`,
];

/** Hubs auto-gerados (orchestrator reescreve no primeiro refresh). */
const EXCLUDE_AUTOGEN_HUBS = [
  `Kloel${sep}00-HUD${sep}00-NEXT.md`,
  `Kloel${sep}00-HUD${sep}00-BLOCKERS.md`,
  `Kloel${sep}00-HUD${sep}00-DAG.md`,
  `Kloel${sep}00-HUD${sep}00-PROVIDERS.md`,
  `Kloel${sep}00-HUD${sep}00-REGRESSIONS.md`,
];

const norm = (p) => p.split(sep).join('/');
function isExcluded(absPath) {
  const rel = absPath.slice(VAULT_ROOT.length + 1);
  const relPosix = norm(rel);
  for (const ex of [...EXCLUDE_PREFIXES, ...EXCLUDE_AUTOGEN_HUBS]) {
    const exPosix = norm(ex);
    if (relPosix === exPosix || relPosix.startsWith(`${exPosix}/`)) return true;
  }
  // node_modules dentro de qualquer plugin (regenerável via npm i)
  if (relPosix.includes('/node_modules/') || relPosix.endsWith('/node_modules')) return true;
  // lixo solto na raiz do vault
  if (/^Sem título.*\.canvas$/.test(rel)) return true;
  if (/^\d{4}-\d{2}-\d{2}\.md$/.test(rel)) return true; // daily notes soltas
  if (rel === '.DS_Store' || relPosix.endsWith('/.DS_Store')) return true;
  return false;
}

const stageRoot = mkdtempSync(join(tmpdir(), 'kloel-hud-skel-'));
const bundleDir = join(stageRoot, BUNDLE_NAME);
mkdirSync(bundleDir, { recursive: true });

console.log(`[build-skeleton] vault origem : ${VAULT_ROOT}`);
console.log(`[build-skeleton] staging      : ${bundleDir}`);

for (const top of ['.obsidian', 'Kloel']) {
  const src = join(VAULT_ROOT, top);
  if (!existsSync(src)) {
    console.warn(`[build-skeleton] aviso: ${top} ausente, pulando`);
    continue;
  }
  cpSync(src, join(bundleDir, top), {
    recursive: true,
    filter: (s) => !isExcluded(s),
  });
}

// Mantém a pasta do espelho viva, mas vazia (o daemon cria _source/).
const mirrorDir = join(bundleDir, 'Kloel', '99 - Espelho do Codigo', '_source');
mkdirSync(mirrorDir, { recursive: true });
writeFileSync(
  join(mirrorDir, '.keep'),
  'O mirror daemon regenera este diretório a partir do código.\n',
);

// ── Scrub de segredos: nenhuma chave/token de plugin pode viajar ─────────────
// Cada máquina gera os seus na primeira execução (REST API, MCP, bridge).
const SECRET_KEYS = new Set([
  'apiKey',
  'token',
  'secret',
  'password',
  'crypto', // cert/chave TLS auto-assinado, por máquina
  'certificateConfig',
]);
function scrubSecretsDeep(obj) {
  let hit = false;
  if (Array.isArray(obj)) {
    for (const v of obj) if (v && typeof v === 'object') hit = scrubSecretsDeep(v) || hit;
    return hit;
  }
  for (const k of Object.keys(obj)) {
    if (SECRET_KEYS.has(k)) {
      delete obj[k];
      hit = true;
    } else if (obj[k] && typeof obj[k] === 'object') {
      hit = scrubSecretsDeep(obj[k]) || hit;
    }
  }
  return hit;
}
const pluginsDir = join(bundleDir, '.obsidian', 'plugins');
if (existsSync(pluginsDir)) {
  for (const plugin of readdirSync(pluginsDir)) {
    const dataPath = join(pluginsDir, plugin, 'data.json');
    if (!existsSync(dataPath)) continue;
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(dataPath, 'utf8'));
    } catch {
      continue; // data.json não-JSON: deixa como está
    }
    if (scrubSecretsDeep(cfg)) {
      writeFileSync(dataPath, `${JSON.stringify(cfg, null, 2)}\n`);
      console.log(`[build-skeleton] scrub segredo: plugins/${plugin}/data.json`);
    }
  }
}

// ── Genericiza paths absolutos → placeholders (bootstrap substitui) ──────────
// Ordem importa: repo e vault primeiro, home cru por último.
const PATH_RULES = [
  [/\/Users\/danielpenin\/whatsapp_saas/g, '__KLOEL_REPO_ROOT__'],
  [/\/Users\/danielpenin\/Documents\/Obsidian Vault/g, '__KLOEL_VAULT_ROOT__'],
  [/\/Users\/danielpenin/g, '__KLOEL_HOME__'],
];
const TEXT_EXT = /\.(js|ts|mjs|cjs|json|md|css|txt|base|canvas)$/i;
let genericized = 0;
function genericizePaths(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      genericizePaths(full);
      continue;
    }
    if (!TEXT_EXT.test(entry) || st.size > 2 * 1024 * 1024) continue;
    const before = readFileSync(full, 'utf8');
    let after = before;
    for (const [re, to] of PATH_RULES) after = after.replace(re, to);
    if (after !== before) {
      writeFileSync(full, after);
      genericized += 1;
    }
  }
}
genericizePaths(bundleDir);
console.log(`[build-skeleton] paths genericizados em ${genericized} arquivo(s)`);

// Fail-loud: nenhum vestígio do home do dono pode sobrar no bundle.
// grep sai com código 1 quando NÃO há match — esse é o caminho feliz.
let leak = '';
try {
  leak = execFileSync('grep', ['-rl', '/Users/danielpenin', bundleDir], {
    encoding: 'utf8',
  }).trim();
} catch (e) {
  if (e.status === 1) leak = ''; // sem matches = limpo
  else throw e;
}
if (leak) {
  console.error(`[build-skeleton] ERRO: paths de máquina ainda presentes:\n${leak}`);
  process.exit(1);
}

// Marcador de proveniência (sem dados de máquina).
writeFileSync(
  join(bundleDir, 'SKELETON_INFO.json'),
  `${JSON.stringify(
    {
      bundle: 'kloel-obsidian-hud-skeleton',
      generatedAt: new Date().toISOString(),
      note: 'Esqueleto portável do HUD KLOEL. Sem _source (regenera), sem layout de máquina, sem segredos.',
    },
    null,
    2,
  )}\n`,
);

// ── Empacota ─────────────────────────────────────────────────────────────────
if (existsSync(OUT_TARBALL)) rmSync(OUT_TARBALL);
execFileSync('tar', ['-czf', OUT_TARBALL, '-C', stageRoot, BUNDLE_NAME], {
  stdio: 'inherit',
});
rmSync(stageRoot, { recursive: true, force: true });

const sizeMB = (
  execFileSync('du', ['-m', OUT_TARBALL]).toString().split('\t')[0] | 0
);
console.log(`[build-skeleton] OK → ${OUT_TARBALL} (~${sizeMB} MB)`);
