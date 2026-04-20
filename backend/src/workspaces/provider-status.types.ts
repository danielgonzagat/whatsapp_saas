import type { ProviderSessionSnapshot } from '../whatsapp/provider-settings.types';
import type {
  NormalizedConnectionStatus,
  WhatsAppProviderType,
} from './provider-status-lookup.util';

/** Build snapshot params shape. */
export interface BuildSnapshotParams {
  providerType: WhatsAppProviderType;
  session: ProviderSessionSnapshot;
  rawStatus: string;
  normalizedStatus: NormalizedConnectionStatus;
  phoneNumberId: string | null;
  disconnectReason: string;
  workspaceId: string;
}
