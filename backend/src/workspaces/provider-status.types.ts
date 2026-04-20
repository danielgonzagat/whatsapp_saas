import type { ProviderSessionSnapshot } from '../whatsapp/provider-settings.types';
import type {
  NormalizedConnectionStatus,
  WhatsAppProviderType,
} from './provider-status-lookup.util';

/** Build snapshot params shape. */
export interface BuildSnapshotParams {
  /** Provider type property. */
  providerType: WhatsAppProviderType;
  /** Session property. */
  session: ProviderSessionSnapshot;
  /** Raw status property. */
  rawStatus: string;
  /** Normalized status property. */
  normalizedStatus: NormalizedConnectionStatus;
  /** Phone number id property. */
  phoneNumberId: string | null;
  /** Disconnect reason property. */
  disconnectReason: string;
  /** Workspace id property. */
  workspaceId: string;
}
