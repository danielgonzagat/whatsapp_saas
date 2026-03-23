export interface WorkspaceEntity {
  id: string;

  whatsappProvider: 'whatsapp-api' | 'whatsapp-web-agent';

  // Anti-ban
  jitterMin: number;
  jitterMax: number;

  createdAt: number;
  updatedAt: number;
}
