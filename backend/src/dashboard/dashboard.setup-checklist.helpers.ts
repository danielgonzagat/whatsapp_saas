/** A single onboarding setup-checklist item read from the kloelMemory store. */
export interface SetupChecklistItem {
  key: string;
  completed: boolean;
}

/** Display copy for each known setup-checklist checkpoint key. */
export const SETUP_CHECKPOINT_COPY: Record<string, { label: string; description: string }> = {
  profile: {
    label: 'Perfil comercial configurado',
    description:
      'O onboarding precisa salvar o tipo de usuário, canal principal e uso inicial da IA.',
  },
  product: {
    label: 'Produto informado',
    description:
      'O workspace precisa ter produto próprio ou intenção clara de cadastrar um produto.',
  },
  checkout: {
    label: 'Checkout informado',
    description: 'O produtor precisa confirmar se já possui checkout ou criar um checkout Kloel.',
  },
  payment: {
    label: 'Pagamentos conectados',
    description: 'O workspace precisa ter provider de pagamento pronto para receber vendas reais.',
  },
  channel: {
    label: 'Canal principal definido',
    description: 'WhatsApp, Instagram, Messenger ou e-mail precisa estar definido no setup.',
  },
  ai: {
    label: 'Uso da IA definido',
    description: 'A IA precisa saber se começa em atendimento, venda ou recuperação.',
  },
};

/**
 * Safely parse the persisted setup-checklist value from kloelMemory into a
 * typed list. Discards malformed entries silently so the dashboard never
 * crashes on dirty/legacy payloads.
 */
export function readSetupChecklist(value: unknown): SetupChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || typeof record.completed !== 'boolean') {
      return [];
    }
    return [{ key: record.key, completed: record.completed }];
  });
}

/** Health-checkpoint shape used by the dashboard home snapshot. */
export interface SetupCheckpoint {
  id: string;
  label: string;
  description: string;
  active: boolean;
}

/**
 * Map onboarding setup-checklist items into dashboard-home health checkpoints,
 * applying the configured display copy and a sensible fallback for unknown
 * keys.
 */
export function buildSetupCheckpoints(items: SetupChecklistItem[]): SetupCheckpoint[] {
  return items.map((item) => {
    const copy = SETUP_CHECKPOINT_COPY[item.key] ?? {
      label: `Setup: ${item.key}`,
      description: 'Item de setup persistido pelo onboarding inicial.',
    };
    return {
      id: `setup-${item.key}`,
      label: copy.label,
      description: copy.description,
      active: item.completed,
    };
  });
}
