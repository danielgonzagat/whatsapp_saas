#!/usr/bin/env node

import {
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteMirrorFrontmatterTags } from '../obsidian-mirror-daemon-indexes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(__dirname, '..', '..'));

const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_MIRROR_DIR = join(MIRROR_ROOT, '_source');

const PHASE_TAG_PREFIX = 'kloel/phase-';

const MODULE_PHASE_MAP = {
  Auth: 0,
  Workspaces: 0,
  Settings: 0,
  KYC: 0,
  Products: 1,
  Checkout: 1,
  Wallet: 1,
  Billing: 1,
  WhatsApp: 2,
  Inbox: 2,
  Autopilot: 2,
  Flows: 2,
  CIA: 3,
  CRM: 3,
  Dashboard: 3,
  Analytics: 3,
  Reports: 3,
  Vendas: 4,
  Affiliate: 4,
  'Member Area': 4,
  Campaigns: 4,
  FollowUps: 4,
  Marketing: 5,
  Anúncios: 5,
  Sites: 5,
  Canvas: 5,
  Funnels: 5,
  Webinários: 5,
  Leads: 5,
  Team: 6,
  'API Keys': 6,
  Webhooks: 6,
  'Audit Log': 6,
  Notifications: 6,
  Marketplace: 6,
  Video: 6,
  Voice: 6,
};

const BACKEND_DIR_MAP = {
  auth: 'Auth',
  workspaces: 'Workspaces',
  kyc: 'KYC',
  checkout: 'Checkout',
  wallet: 'Wallet',
  billing: 'Billing',
  whatsapp: 'WhatsApp',
  inbox: 'Inbox',
  autopilot: 'Autopilot',
  flows: 'Flows',
  cia: 'CIA',
  'ai-brain': 'CIA',
  crm: 'CRM',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  reports: 'Reports',
  pipeline: 'Vendas',
  affiliate: 'Affiliate',
  partnerships: 'Affiliate',
  'member-area': 'Member Area',
  campaigns: 'Campaigns',
  followup: 'FollowUps',
  marketing: 'Marketing',
  scrapers: 'Leads',
  team: 'Team',
  'api-keys': 'API Keys',
  webhooks: 'Webhooks',
  audit: 'Audit Log',
  notifications: 'Notifications',
  marketplace: 'Marketplace',
  video: 'Video',
  voice: 'Voice',
};

const FRONTEND_PATH_SEGMENTS = {
  auth: 'Auth',
  workspace: 'Workspaces',
  settings: 'Settings',
  kyc: 'KYC',
  products: 'Products',
  checkout: 'Checkout',
  wallet: 'Wallet',
  billing: 'Billing',
  whatsapp: 'WhatsApp',
  inbox: 'Inbox',
  autopilot: 'Autopilot',
  flows: 'Flows',
  cia: 'CIA',
  crm: 'CRM',
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  reports: 'Reports',
  vendas: 'Vendas',
  pipeline: 'Vendas',
  affiliate: 'Affiliate',
  partnerships: 'Affiliate',
  'member-area': 'Member Area',
  campaigns: 'Campaigns',
  followup: 'FollowUps',
  marketing: 'Marketing',
  'member-area': 'Member Area',
  members: 'Member Area',
  sites: 'Sites',
  canvas: 'Canvas',
  funnels: 'Funnels',
  webinários: 'Webinários',
  leads: 'Leads',
  scrapers: 'Leads',
  team: 'Team',
  'api-keys': 'API Keys',
  webhooks: 'Webhooks',
  audit: 'Audit Log',
  notifications: 'Notifications',
  marketplace: 'Marketplace',
  video: 'Video',
  voice: 'Voice',
};

const SKIP_PREFIXES = [
  'scripts/',
  'ops/',
  'docs/',
  '.github/',
  '.husky/',
  'prisma/',
  'nginx/',
  'e2e/',
  '.claude/',
  '.agents/',
  '.pulse/',
  '.omx/',
  '.gitnexus/',
  '.kilo/',
  '.beads/',
  '.serena/',
  '.turbo/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  'artifacts/',
  'tmp/',
];

const SKIP_ROOT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.editorconfig',
  '.prettierrc.json',
  '.gitignore',
  '.nvmrc',
  '.node-version',
  '.npmrc',
  '.codacy.yml',
  'CLAUDE.md',
  'AGENTS.md',
  'CODEX.md',
  '.sentryclirc',
]);

const SKIP_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp3',
  '.mp4',
  '.webm',
  '.mov',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.wasm',
  '.bin',
  '.lock',
  '.log',
  '.map',
  '.tsbuildinfo',
]);

function isSkippable(relPath) {
  if (SKIP_ROOT_FILES.has(relPath)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }
  const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
  if (SKIP_EXTS.has(ext)) return true;
  if (relPath.startsWith('../../') || relPath.startsWith('/')) return true;
  if (
    relPath.includes('/node_modules/') ||
    relPath.includes('/dist/') ||
    relPath.includes('/build/') ||
    relPath.includes('/coverage/') ||
    relPath.includes('/.next/') ||
    relPath.includes('/__pycache__/')
  )
    return true;
  return false;
}

function fileIsDotfileInRoot(relPath) {
  return relPath.startsWith('.') && !relPath.includes('/');
}

function listAllRepoFiles(rootDir, relPrefix) {
  const files = [];
  const stack = [{ dir: rootDir, rel: relPrefix }];
  while (stack.length > 0) {
    const { dir, rel } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.next' ||
          entry.name === '__pycache__'
        )
          continue;
        if (isSkippable(relPath + '/')) continue;
        stack.push({ dir: abs, rel: relPath });
      } else if (entry.isFile()) {
        if (fileIsDotfileInRoot(relPath)) continue;
        if (isSkippable(relPath)) continue;
        files.push(relPath);
      }
    }
  }
  return files;
}

function inferModule(relPath) {
  const segments = relPath.replace(/\\/g, '/').split('/');

  if (segments[0] === 'backend' && segments[1] === 'src' && segments[2]) {
    const dir = segments[2];
    if (BACKEND_DIR_MAP[dir]) return BACKEND_DIR_MAP[dir];
  }

  if (segments[0] === 'worker') {
    if (relPath.includes('whatsapp') || relPath.includes('waha') || relPath.includes('meta-'))
      return 'WhatsApp';
    return null;
  }

  if (segments[0] === 'frontend') {
    const srcIdx = segments.indexOf('src');
    if (srcIdx === -1) return null;

    for (let i = srcIdx + 1; i < segments.length; i++) {
      const seg = segments[i].toLowerCase();
      if (FRONTEND_PATH_SEGMENTS[seg]) return FRONTEND_PATH_SEGMENTS[seg];
    }
  }

  return null;
}

function inferModuleFromTestPath(relPath) {
  const clean = relPath.replace(/^.*\/__tests__\//, '');
  const noExt = clean.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '');
  const noMock = noExt.replace(/^__mocks__\//, '');
  return inferModule(noMock);
}

function pathToModule(relPath) {
  let module = inferModule(relPath);
  if (
    !module &&
    (relPath.endsWith('.test.ts') ||
      relPath.endsWith('.spec.ts') ||
      relPath.endsWith('.test.tsx') ||
      relPath.endsWith('.spec.tsx') ||
      relPath.includes('/__tests__/'))
  ) {
    module = inferModuleFromTestPath(relPath);
  }
  return module;
}

function readMirrorTags(mirrorRelPath) {
  const absPath = join(SOURCE_MIRROR_DIR, mirrorRelPath);
  if (!existsSync(absPath)) return null;
  const content = readFileSync(absPath, 'utf8');
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end).split('\n');
  const tags = [];
  let inTags = false;
  for (const line of frontmatter) {
    if (line === 'tags:') {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (line.startsWith('  - ')) {
        tags.push(line.slice(4));
        continue;
      }
      inTags = false;
    }
  }
  return tags;
}

function mirrorRelPathForSource(relPath) {
  return relPath.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '.md');
}

function atomWrite(absPath, content) {
  const tmp = absPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
}

function extractClaimedModules(fileContent, relPath) {
  const modules = new Set();
  const lower = fileContent.toLowerCase();
  for (const [dir, module] of Object.entries(BACKEND_DIR_MAP)) {
    if (relPath.includes(`/${dir}/`)) {
      modules.add(module);
    }
  }
  return modules;
}

function main() {
  const dry = process.argv.includes('--dry');

  if (!existsSync(SOURCE_MIRROR_DIR)) {
    process.stderr.write(
      JSON.stringify({ error: 'mirror source dir not found', path: SOURCE_MIRROR_DIR }) + '\n',
    );
    process.exit(2);
  }

  const allFiles = listAllRepoFiles(REPO_ROOT, '');
  const phaseDistribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let sidecarsEmitted = 0;
  let mirrorsTouched = 0;
  let skipped = 0;

  for (const relPath of allFiles) {
    const module = pathToModule(relPath);
    if (!module) {
      skipped++;
      continue;
    }

    const phase = MODULE_PHASE_MAP[module];
    if (phase === undefined) {
      skipped++;
      continue;
    }

    const mirrorRel = mirrorRelPathForSource(relPath);
    const mirrorAbs = join(SOURCE_MIRROR_DIR, mirrorRel);

    const sidecarPath = mirrorAbs.replace(/\.md$/, '.phase.json');
    const sidecar =
      JSON.stringify(
        {
          schema: 'kloel.phase.v1',
          phase,
          module,
          evidence: [`dag:CLAUDE.md FASE ${phase} — ${module}`, `path:${relPath}`],
          computedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n';

    if (!dry) {
      atomWrite(sidecarPath, sidecar);
    }
    sidecarsEmitted++;
    phaseDistribution[phase]++;

    if (!existsSync(mirrorAbs)) continue;

    const existingTags = readMirrorTags(mirrorRel);
    if (existingTags === null) continue;

    const phaseTag = `kloel/phase-${phase}`;
    const merged = existingTags.filter((t) => !t.startsWith(PHASE_TAG_PREFIX));
    merged.push(phaseTag);
    merged.sort();

    if (JSON.stringify(merged) === JSON.stringify(existingTags)) continue;

    if (!dry) {
      rewriteMirrorFrontmatterTags(mirrorRel, merged);
    }
    mirrorsTouched++;
  }

  const summary = {
    filesScanned: allFiles.length,
    phaseDistribution,
    sidecarsEmitted,
    mirrorsTouched,
    skipped,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

main();
