/** Workspace entity shape. */
export interface WorkspaceEntity {
  id: string;

  whatsappProvider: 'meta-cloud' | 'whatsapp-api';

  // Anti-ban
  jitterMin: number;
  jitterMax: number;

  createdAt: number;
  updatedAt: number;
}
