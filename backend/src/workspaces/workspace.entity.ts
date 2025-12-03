export interface WorkspaceEntity {
  id: string;

  // Provider escolhido pelo usuário
  whatsappProvider:
    | 'meta'
    | 'wpp'
    | 'evolution'
    | 'ultrawa'
    | 'hybrid'
    | 'auto';

  // Credenciais
  meta: {
    token: string;
    phoneId: string;
  };

  wpp: {
    sessionId: string;
  };

  evolution: {
    apiKey: string;
  };

  ultrawa: {
    apiKey: string;
  };

  // Anti-ban
  jitterMin: number;
  jitterMax: number;

  createdAt: number;
  updatedAt: number;
}
