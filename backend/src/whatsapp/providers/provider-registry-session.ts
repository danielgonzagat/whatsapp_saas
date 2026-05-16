import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings, type ProviderSessionSnapshot } from '../provider-settings.types';
import { WahaProvider } from './waha.provider';
import { WhatsAppApiProvider } from './whatsapp-api.provider';
import type { WhatsAppProviderType, SessionStatus, UnknownRecord } from './provider-registry.types';
import { MissingWahaProviderError } from './provider-registry.types';

export function readRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length > 0 ? items : [];
}

function normalizeWahaSnapshotStatus(
  rawStatus: string | null | undefined,
): 'connected' | 'connecting' | 'failed' | 'disconnected' {
  const normalized = String(rawStatus || '')
    .trim()
    .toUpperCase();

  if (normalized === 'CONNECTED' || normalized === 'WORKING') {
    return 'connected';
  }

  if (
    normalized === 'SCAN_QR_CODE' ||
    normalized === 'QR_PENDING' ||
    normalized === 'STARTING' ||
    normalized === 'OPENING'
  ) {
    return 'connecting';
  }

  if (normalized === 'FAILED') {
    return 'failed';
  }

  return 'disconnected';
}

function readSessionSnapshot(value: unknown): ProviderSessionSnapshot {
  const snapshot = readRecord(value);
  const status = readString(snapshot.status);
  const provider = readString(snapshot.provider);
  const lastUpdated = readString(snapshot.lastUpdated);

  return {
    rawStatus: readString(snapshot.rawStatus) ?? null,
    phoneNumber: readString(snapshot.phoneNumber) ?? null,
    pushName: readString(snapshot.pushName) ?? null,
    selfIds: readStringArray(snapshot.selfIds) ?? [],
    qrCode: readString(snapshot.qrCode) ?? null,
    authUrl: readString(snapshot.authUrl) ?? null,
    phoneNumberId: readString(snapshot.phoneNumberId) ?? null,
    whatsappBusinessId: readString(snapshot.whatsappBusinessId) ?? null,
    sessionName: readString(snapshot.sessionName) ?? null,
    disconnectReason: readString(snapshot.disconnectReason) ?? null,
    ...(status !== undefined ? { status } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(lastUpdated !== undefined ? { lastUpdated } : {}),
  };
}

export async function persistSessionSnapshot(
  prisma: PrismaService,
  defaultProvider: WhatsAppProviderType,
  workspaceId: string,
  update: Partial<ProviderSessionSnapshot>,
) {
  await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    if (!workspace) {
      return;
    }

    const settings = asProviderSettings(workspace.providerSettings);
    const currentSession = settings.whatsappApiSession || {};

    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: JSON.parse(
          JSON.stringify({
            ...settings,
            whatsappProvider: defaultProvider,
            connectionStatus: update.status || currentSession.status || 'unknown',
            whatsappApiSession: {
              ...currentSession,
              ...update,
              provider: defaultProvider,
              lastUpdated: new Date().toISOString(),
            },
          }),
        ) as Prisma.InputJsonObject,
      },
    });
  });
}

export interface SessionDeps {
  prisma: PrismaService;
  metaCloudProvider: WhatsAppApiProvider;
  wahaProvider: WahaProvider | undefined;
  defaultProvider: WhatsAppProviderType;
  isWahaMode: () => boolean;
  getProviderType: (workspaceId: string) => Promise<WhatsAppProviderType>;
}

export async function startSession(
  deps: SessionDeps,
  workspaceId: string,
): Promise<{
  success: boolean;
  qrCode?: string;
  message?: string;
  authUrl?: string;
}> {
  await deps.getProviderType(workspaceId);

  if (deps.isWahaMode()) {
    if (!deps.wahaProvider) {
      throw new MissingWahaProviderError();
    }
    const result = await deps.wahaProvider.startSession(workspaceId);
    await persistSessionSnapshot(deps.prisma, deps.defaultProvider, workspaceId, {
      status: result.message === 'already_connected' ? 'connected' : 'connecting',
      rawStatus: result.message === 'already_connected' ? 'CONNECTED' : 'STARTING',
      disconnectReason: null,
      ...(result.message === 'already_connected' ? { qrCode: null } : {}),
      sessionName: workspaceId,
    });
    return { success: result.success, message: result.message };
  }

  const result = await deps.metaCloudProvider.startSession(workspaceId);
  await persistSessionSnapshot(deps.prisma, deps.defaultProvider, workspaceId, {
    status: result.message === 'already_connected' ? 'connected' : 'connection_required',
    qrCode: null,
    authUrl: result.authUrl || null,
    sessionName: workspaceId,
  });
  return result;
}

export async function getSessionStatus(
  deps: SessionDeps,
  workspaceId: string,
): Promise<SessionStatus> {
  await deps.getProviderType(workspaceId);

  if (deps.isWahaMode() && deps.wahaProvider) {
    const wahaStatus = await deps.wahaProvider.getSessionStatus(workspaceId);
    const connected = wahaStatus.state === 'CONNECTED';
    const snapshotStatus = normalizeWahaSnapshotStatus(wahaStatus.state);
    const status: SessionStatus = {
      connected,
      status: wahaStatus.state || 'DISCONNECTED',
      selfIds: wahaStatus.selfIds || [],
      ...(wahaStatus.phoneNumber != null ? { phoneNumber: wahaStatus.phoneNumber } : {}),
      ...(wahaStatus.pushName != null ? { pushName: wahaStatus.pushName } : {}),
    };
    await persistSessionSnapshot(deps.prisma, deps.defaultProvider, workspaceId, {
      status: snapshotStatus,
      rawStatus: status.status,
      phoneNumber: status.phoneNumber || null,
      pushName: status.pushName || null,
      selfIds: status.selfIds || [],
      disconnectReason: connected ? null : wahaStatus.message || null,
      ...(connected ? { qrCode: null } : {}),
      sessionName: workspaceId,
    });
    return status;
  }

  const [workspace, details] = await Promise.all([
    deps.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    }),
    deps.metaCloudProvider.getSessionConfigDiagnostics(workspaceId),
  ]);
  const settings = asProviderSettings(workspace?.providerSettings);
  const snapshot = readSessionSnapshot(settings.whatsappApiSession);
  const snapshotStatus = String(snapshot.status || snapshot.rawStatus || '')
    .trim()
    .toUpperCase();
  const snapshotConnected = snapshotStatus === 'CONNECTED' || snapshotStatus === 'WORKING';
  const liveConnected = details.state === 'CONNECTED';
  const fallbackToSnapshot = !liveConnected && details.state === 'DEGRADED' && snapshotConnected;

  const resolvedPhoneNumber = details.phoneNumber || snapshot.phoneNumber || undefined;
  const resolvedPushName = details.pushName || snapshot.pushName || undefined;
  const resolvedAuthUrl = details.authUrl || snapshot.authUrl || undefined;
  const resolvedPhoneNumberId = details.phoneNumberId || snapshot.phoneNumberId || undefined;
  const resolvedWhatsappBusinessId =
    details.whatsappBusinessId || snapshot.whatsappBusinessId || undefined;

  const status: SessionStatus = {
    connected: liveConnected || fallbackToSnapshot,
    status: fallbackToSnapshot ? 'CONNECTED' : details.state || 'DISCONNECTED',
    selfIds: [],
    degradedReason: fallbackToSnapshot ? null : details.error || null,
    ...(resolvedPhoneNumber != null ? { phoneNumber: resolvedPhoneNumber } : {}),
    ...(resolvedPushName != null ? { pushName: resolvedPushName } : {}),
    ...(resolvedAuthUrl != null ? { authUrl: resolvedAuthUrl } : {}),
    ...(resolvedPhoneNumberId != null ? { phoneNumberId: resolvedPhoneNumberId } : {}),
    ...(resolvedWhatsappBusinessId != null
      ? { whatsappBusinessId: resolvedWhatsappBusinessId }
      : {}),
  };

  await persistSessionSnapshot(deps.prisma, deps.defaultProvider, workspaceId, {
    status: status.connected ? 'connected' : 'disconnected',
    phoneNumber: status.phoneNumber || null,
    pushName: status.pushName || null,
    selfIds: status.selfIds || [],
    sessionName: workspaceId,
    authUrl: status.authUrl || null,
    phoneNumberId: status.phoneNumberId || null,
    whatsappBusinessId: status.whatsappBusinessId || null,
  });
  return status;
}

export async function getQrCode(
  deps: SessionDeps,
  workspaceId: string,
): Promise<{ success: boolean; qr?: string; message?: string }> {
  await deps.getProviderType(workspaceId);

  if (deps.isWahaMode() && deps.wahaProvider) {
    return deps.wahaProvider.getQrCode(workspaceId);
  }
  return deps.metaCloudProvider.getQrCode(workspaceId);
}
