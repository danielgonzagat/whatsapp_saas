export interface WorkspaceEntity {
  id: string;

  whatsappProvider: 'meta-cloud';

  // Anti-ban
  jitterMin: number;
  jitterMax: number;

  createdAt: number;
  updatedAt: number;
}
