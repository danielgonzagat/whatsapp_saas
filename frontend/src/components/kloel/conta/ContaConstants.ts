import type { SettingsSectionKey } from './ContaTypes';

export const D_RE = /\D/g;
export const U0300__U036F_RE = /[\u0300-\u036f]/g;
export const HTTPS_RE = /^https?:\/\//;

export const SORA = "'Sora', sans-serif";
export const MONO = "'JetBrains Mono', monospace";
export const EMBER = 'colors.ember.primary';

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = 'pessoal';

export const SETTINGS_SECTION_ALIASES: Record<string, SettingsSectionKey> = {
  workspace: 'account',
  account: 'account',
  configuracao: 'account',
  'configuracao-da-conta': 'account',
  pessoal: 'pessoal',
  personal: 'pessoal',
  fiscal: 'fiscal',
  documentos: 'documentos',
  documents: 'documentos',
  bancario: 'bancario',
  bank: 'bancario',
  billing: 'billing',
  pagamentos: 'billing',
  payment: 'billing',
  payments: 'billing',
  upgrades: 'billing',
  plano: 'billing',
  apps: 'apps',
  integracoes: 'apps',
  integrations: 'apps',
  brain: 'brain',
  kloel: 'brain',
  crm: 'crm',
  analytics: 'analytics',
  activity: 'activity',
  atividade: 'activity',
  seguranca: 'seguranca',
  security: 'seguranca',
  equipe: 'equipe',
  team: 'equipe',
  notificacoes: 'notificacoes',
  notifications: 'notificacoes',
  perfil: 'perfil',
  profile: 'perfil',
  idiomas: 'idiomas',
  language: 'idiomas',
  languages: 'idiomas',
  presentear: 'presentear',
  gift: 'presentear',
  'saiba-mais': 'saiba-mais',
  'learn-more': 'saiba-mais',
  about: 'saiba-mais',
  ajuda: 'ajuda',
  help: 'ajuda',
  sair: 'sair',
  logout: 'sair',
};

export function resolveSettingsSection(raw: string | null | undefined): SettingsSectionKey {
  if (!raw) {
    return DEFAULT_SETTINGS_SECTION;
  }
  return SETTINGS_SECTION_ALIASES[raw] || DEFAULT_SETTINGS_SECTION;
}

export const ROLES: Record<string, string> = {
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
};
