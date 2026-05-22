import { resolve, join } from 'node:path';

export const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || '/Users/danielpenin/whatsapp_saas');
export const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
export const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
export const SOURCE_DIR = join(MIRROR_ROOT, '_source');
export const HUD_DIR = join(SOURCE_DIR, '.hud');
export const OBSIDIAN_CONFIG = join(VAULT_ROOT, '.obsidian');
export const PLUGINS_DIR = join(OBSIDIAN_CONFIG, 'plugins');
export const ORCHESTRATION_DIR = join(REPO_ROOT, 'scripts', 'orchestration');
export const SNIPPETS_DIR = join(OBSIDIAN_CONFIG, 'snippets');
