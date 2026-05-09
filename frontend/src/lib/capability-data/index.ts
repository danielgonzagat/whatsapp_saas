export type { CapabilityCategory, CapabilityRole, CapabilityStatus, FrontendCapability } from './types';
export { IMPULSIONE_CAPABILITIES } from './impulsione';
export { RECUPERE_CAPABILITIES } from './recupere';
export { FALE_CAPABILITIES } from './fale';
export { GERENCIE_CAPABILITIES } from './gerencie';

import { colors } from '@/lib/design-tokens';
import type { CapabilityCategory, FrontendCapability } from './types';
import { IMPULSIONE_CAPABILITIES } from './impulsione';
import { RECUPERE_CAPABILITIES } from './recupere';
import { FALE_CAPABILITIES } from './fale';
import { GERENCIE_CAPABILITIES } from './gerencie';

export const CAPABILITY_CATEGORY_META: Record<
  CapabilityCategory,
  { icon: string; title: string; color: string }
> = {
  impulsione: { icon: '\u{1F680}', title: 'Impulsione', color: colors.semantic.info },
  recupere: { icon: '\u{1F504}', title: 'Recupere', color: colors.canvas.lime },
  fale: { icon: '\u{1F4AC}', title: 'Fale', color: colors.semantic.warning },
  gerencie: { icon: '\u{2699}\u{FE0F}', title: 'Gerencie', color: colors.semantic.purple },
};

export const FRONTEND_CAPABILITIES: FrontendCapability[] = [
  ...IMPULSIONE_CAPABILITIES,
  ...RECUPERE_CAPABILITIES,
  ...FALE_CAPABILITIES,
  ...GERENCIE_CAPABILITIES,
];

export function getCapabilitiesByCategory(category: CapabilityCategory) {
  return FRONTEND_CAPABILITIES.filter((capability) => capability.category === category);
}

export function partitionCapabilities(capabilities: FrontendCapability[]) {
  return capabilities.reduce(
    (acc, capability) => {
      if (capability.status === 'planned') {
        acc.roadmap.push(capability);
      } else {
        acc.live.push(capability);
      }
      return acc;
    },
    { live: [] as FrontendCapability[], roadmap: [] as FrontendCapability[] },
  );
}

export function getCategoryCounts(category: CapabilityCategory) {
  const items = getCapabilitiesByCategory(category);
  return {
    total: items.length,
    active: items.filter((item) => item.status === 'active').length,
    partial: items.filter((item) => item.status === 'partial').length,
    planned: items.filter((item) => item.status === 'planned').length,
  };
}

export function getCapabilityBadge(capability: FrontendCapability) {
  if (capability.badge) {
    return capability.badge;
  }
  if (capability.status === 'partial') {
    return 'Parcial';
  }
  return undefined;
}

export function findCapabilityByTitle(title?: string | null) {
  if (!title) {
    return undefined;
  }
  return FRONTEND_CAPABILITIES.find((capability) => capability.title === title);
}

export function getCapabilityHref(capability: FrontendCapability) {
  return capability.route;
}

export function getRelatedActiveCapabilities(capability: FrontendCapability, limit = 3) {
  return FRONTEND_CAPABILITIES.filter((item) => {
    if (item.title === capability.title) {
      return false;
    }
    if (item.status !== 'active') {
      return false;
    }
    if (item.category !== capability.category) {
      return false;
    }
    return item.roles.some((role) => capability.roles.includes(role));
  }).slice(0, limit);
}

export function getCapabilityRoadmapActions(capability?: FrontendCapability) {
  return capability?.roadmapActions ?? [];
}

export const QUICK_NAV_CAPABILITIES = [
  { title: 'Ir para Inbox', href: '/inbox', keywords: ['inbox', 'atendimento', 'suporte'] },
  { title: 'Ir para Campanhas', href: '/campaigns', keywords: ['campanhas', 'campaigns', 'email'] },
  { title: 'Ir para Funnels', href: '/funnels', keywords: ['funil', 'funnels'] },
  {
    title: 'Ir para Follow-ups',
    href: '/followups',
    keywords: ['followups', 'retencao', 'carrinho'],
  },
  { title: 'Ir para Webinarios', href: '/webinarios', keywords: ['webinario', 'webinar'] },
  {
    title: 'Ir para Payments',
    href: '/payments',
    keywords: ['payments', 'pagamentos avulsos', 'cobrancas'],
  },
  { title: 'Ir para Video', href: '/video', keywords: ['video', 'voz', 'avatar'] },
  { title: 'Ir para Analytics', href: '/analytics', keywords: ['analytics', 'relatorios'] },
  { title: 'Ir para Autopilot', href: '/autopilot', keywords: ['autopilot', 'ia', 'agente'] },
];
