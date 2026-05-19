

export interface ProductOption {
  id: string;
  name: string;
}

export interface ChannelSetup {
  currentStep: number;
  selectedProductIds: string[];
  arsenal: string[];
  config: {
    tone: string;
    aggressiveness: string;
    workingHours: string;
    followUpEnabled: boolean;
    proactiveDailyLimit: number;
    language: string;
    handoffCriteria: string;
  };
}

export const DEFAULT_SETUP: ChannelSetup = {
  currentStep: 0,
  selectedProductIds: [],
  arsenal: [],
  config: {
    tone: 'consultivo',
    aggressiveness: 'moderado',
    workingHours: '08:00-22:00',
    followUpEnabled: true,
    proactiveDailyLimit: 25,
    language: 'pt-BR',
    handoffCriteria: '',
  },
};

export function normalizeSetup(raw: unknown): ChannelSetup {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const config =
    record.config && typeof record.config === 'object' && !Array.isArray(record.config)
      ? (record.config as Record<string, unknown>)
      : {};
  const currentStep = Number(record.currentStep);
  return {
    currentStep: Number.isInteger(currentStep) ? Math.min(3, Math.max(0, currentStep)) : 0,
    selectedProductIds: Array.isArray(record.selectedProductIds)
      ? record.selectedProductIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [],
    arsenal: Array.isArray(record.arsenal)
      ? record.arsenal.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    config: {
      ...DEFAULT_SETUP.config,
      tone: typeof config.tone === 'string' ? config.tone : DEFAULT_SETUP.config.tone,
      aggressiveness:
        typeof config.aggressiveness === 'string'
          ? config.aggressiveness
          : DEFAULT_SETUP.config.aggressiveness,
      workingHours:
        typeof config.workingHours === 'string'
          ? config.workingHours
          : DEFAULT_SETUP.config.workingHours,
      followUpEnabled:
        typeof config.followUpEnabled === 'boolean'
          ? config.followUpEnabled
          : DEFAULT_SETUP.config.followUpEnabled,
      proactiveDailyLimit:
        typeof config.proactiveDailyLimit === 'number'
          ? config.proactiveDailyLimit
          : DEFAULT_SETUP.config.proactiveDailyLimit,
      language:
        typeof config.language === 'string' ? config.language : DEFAULT_SETUP.config.language,
      handoffCriteria:
        typeof config.handoffCriteria === 'string'
          ? config.handoffCriteria
          : DEFAULT_SETUP.config.handoffCriteria,
    },
  };
}

export function normalizeProduct(raw: unknown): ProductOption | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = String(record.id || '').trim();
  if (!id) {
    return null;
  }
  return {
    id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Produto',
  };
}
