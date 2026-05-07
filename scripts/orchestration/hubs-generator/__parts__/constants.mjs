import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirnamePart = dirname(fileURLToPath(import.meta.url));

// __parts__ is 4 levels deep from repo root:
// scripts/orchestration/hubs-generator/__parts__/constants.mjs
export const REPO_ROOT = resolve(__dirnamePart, '..', '..', '..', '..');
export const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
export const HUD_DIR = join(VAULT_ROOT, 'Kloel', '00-HUD');
export const BLOCKER_PATH = resolve(REPO_ROOT, 'BLOCKER_RANK.json');
export const PROVIDER_PATH = join(
  VAULT_ROOT,
  'Kloel',
  '99 - Espelho do Codigo',
  '_source',
  '.hud',
  'provider-state.json',
);
export const CLAUDE_MD_PATH = resolve(REPO_ROOT, 'CLAUDE.md');

export const DAG_MODULES = {
  0: ['Auth', 'Workspaces', 'Settings', 'KYC'],
  1: ['Products', 'Checkout', 'Wallet', 'Billing'],
  2: ['WhatsApp', 'Inbox', 'Autopilot', 'Flows'],
  3: ['CIA', 'CRM', 'Dashboard', 'Analytics', 'Reports'],
  4: ['Vendas', 'Affiliate', 'Member Area', 'Campaigns', 'FollowUps'],
  5: ['Marketing', 'Anuncios', 'Sites', 'Canvas', 'Funnels', 'Webinarios', 'Leads'],
  6: ['Team', 'API Keys', 'Webhooks', 'Audit Log', 'Notifications', 'Marketplace', 'Video'],
};

export const PHASE_NAMES = {
  0: 'INFRAESTRUTURA',
  1: 'MOTOR COMERCIAL',
  2: 'COMUNICACAO',
  3: 'INTELIGENCIA',
  4: 'CRESCIMENTO',
  5: 'PLATAFORMA AVANCADA',
  6: 'OPERACIONAL',
};
