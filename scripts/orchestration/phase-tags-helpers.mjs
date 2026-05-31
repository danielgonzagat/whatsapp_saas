import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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

// Helpers extracted from phase-tags-emitter
export function isSkippable(relPath) {
  if (SKIP_ROOT_FILES.has(relPath)) {
    return true;
  }
  for (const prefix of SKIP_PREFIXES) {
    if (relPath.startsWith(prefix)) {
      return true;
    }
  }
  const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
  if (SKIP_EXTS.has(ext)) {
    return true;
  }
  if (relPath.startsWith('../../') || relPath.startsWith('/')) {
    return true;
  }
  if (
    relPath.includes('/node_modules/') ||
    relPath.includes('/dist/') ||
    relPath.includes('/build/') ||
    relPath.includes('/coverage/') ||
    relPath.includes('/.next/') ||
    relPath.includes('/__pycache__/')
  ) {
    return true;
  }
  return false;
}

export function fileIsDotfileInRoot(relPath) {
  return relPath.startsWith('.') && !relPath.includes('/');
}

export function listAllRepoFiles(rootDir, relPrefix) {
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
          {continue;}
        if (isSkippable(relPath + '/')) {continue;}
        stack.push({ dir: abs, rel: relPath });
      } else if (entry.isFile()) {
        if (fileIsDotfileInRoot(relPath)) {continue;}
        if (isSkippable(relPath)) {continue;}
        files.push(relPath);
      }
    }
  }
  return files;
}

export function inferModule(relPath) {
  const segments = relPath.replace(/\\/g, '/').split('/');

  if (segments[0] === 'backend' && segments[1] === 'src' && segments[2]) {
    const dir = segments[2];
    if (BACKEND_DIR_MAP[dir]) {return BACKEND_DIR_MAP[dir];}
  }

  if (segments[0] === 'worker') {
    if (relPath.includes('whatsapp') || relPath.includes('waha') || relPath.includes('meta-'))
      {return 'WhatsApp';}
    return null;
  }

  if (segments[0] === 'frontend') {
    const srcIdx = segments.indexOf('src');
    if (srcIdx === -1) {return null;}

    for (let i = srcIdx + 1; i < segments.length; i++) {
      const seg = segments[i].toLowerCase();
      if (FRONTEND_PATH_SEGMENTS[seg]) {return FRONTEND_PATH_SEGMENTS[seg];}
    }
  }

  return null;
}

export function inferModuleFromTestPath(relPath) {
  const clean = relPath.replace(/^.*\/__tests__\//, '');
  const noExt = clean.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '');
  const noMock = noExt.replace(/^__mocks__\//, '');
  return inferModule(noMock);
}

