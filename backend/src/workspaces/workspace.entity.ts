export interface WorkspaceEntity {
  id: string;

  // Runtime consolidado em WAHA
  whatsappProvider: 'whatsapp-api';

  // Anti-ban
  jitterMin: number;
  jitterMax: number;

  createdAt: number;
  updatedAt: number;
}
