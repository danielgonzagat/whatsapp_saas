export type DeletionStatusPayload = {
  provider: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
};

export const deletionStatusCopy: Record<string, { label: string; detail: string }> = {
  pending: {
    label: 'Solicitação registrada',
    detail: 'Seu pedido foi recebido e está aguardando processamento.',
  },
  processing: {
    label: 'Em processamento',
    detail: 'Estamos executando a exclusão ou anonimização solicitada.',
  },
  completed: {
    label: 'Concluído',
    detail: 'O fluxo de exclusão foi concluído e os dados remanescentes seguem retenção legal.',
  },
  failed: {
    label: 'Ação manual necessária',
    detail:
      'Não foi possível concluir automaticamente. Nossa equipe poderá solicitar validação adicional.',
  },
};

export function formatDeletionProviderLabel(provider: string | null | undefined) {
  switch (String(provider || '').trim().toLowerCase()) {
    case 'facebook':
      return 'Facebook';
    case 'google':
      return 'Google';
    case 'self':
      return 'Autoatendimento Kloel';
    default:
      return provider || 'Desconhecido';
  }
}
