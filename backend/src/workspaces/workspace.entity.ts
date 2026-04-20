/** Workspace entity shape. */
export interface WorkspaceEntity {
  /** Id property. */
  id: string;

  /** Whatsapp provider property. */
  whatsappProvider: 'meta-cloud' | 'whatsapp-api';

  // Anti-ban
  jitterMin: number;
  /** Jitter max property. */
  jitterMax: number;

  /** Created at property. */
  createdAt: number;
  /** Updated at property. */
  updatedAt: number;
}
