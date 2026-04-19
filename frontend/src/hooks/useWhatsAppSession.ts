'use client';

import { ensureAnonymousSession } from '@/lib/anonymous-session';
import {
  type WhatsAppConnectResponse,
  type WhatsAppConnectionStatus,
  authApi,
  autostartCia,
  ciaApi,
  disconnectWhatsApp,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  logoutWhatsApp,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
  whatsappApi,
} from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWhatsAppSessionOptions {
  enabled?: boolean;
  workspaceId?: string;
  onConnectionChange?: (connected: boolean) => void;
}

function normalizeWhatsAppProviderSurface(value?: string | null): string | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return undefined;
  if (
    normalized === 'legacy-runtime' ||
    normalized === 'whatsapp-api' ||
    normalized === 'waha' ||
    normalized === 'whatsapp-web-agent'
  ) {
    return 'legacy-runtime';
  }
  return normalized;
}

function sanitizeWhatsAppStatus(status: WhatsAppConnectionStatus): WhatsAppConnectionStatus {
  const provider = normalizeWhatsAppProviderSurface(status.provider);
  const activeProvider = normalizeWhatsAppProviderSurface(status.activeProvider);
  const legacyRuntime = provider === 'legacy-runtime' || activeProvider === 'legacy-runtime';
  const normalizedStatus = status.connected
    ? 'connected'
    : isPendingQrStatus(status.status)
      ? 'connecting'
      : status.status;

  if (!legacyRuntime) {
    return {
      ...status,
      provider,
      activeProvider: activeProvider || null,
      status: normalizedStatus,
    };
  }

  return {
    ...status,
    provider: 'legacy-runtime',
    activeProvider: activeProvider ? 'legacy-runtime' : null,
    status: normalizedStatus,
    qrCode: undefined,
    qrAvailable: false,
    browserSessionStatus: undefined,
    screencastStatus: undefined,
    viewerAvailable: false,
  };
}

function isPendingQrStatus(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();

  return (
    normalized === 'qr_pending' ||
    normalized === 'scan_qr_code' ||
    normalized === 'starting' ||
    normalized === 'opening' ||
    normalized === 'connecting'
  );
}

function resolveStatusMessage(data: { connected: boolean; status?: string | null }): string {
  if (data.connected) return 'Sessão ativa e sincronizada.';
  if (isPendingQrStatus(data.status)) return 'Aguardando leitura do QR Code no aparelho.';
  return 'WhatsApp desconectado.';
}

async function recoverAuthenticatedWorkspaceId(): Promise<string> {
  const me = await authApi.getMe();
  return resolveWorkspaceFromAuthPayload(me.data)?.id || '';
}

const CIA_ACTIVE_MODES = new Set(['LIVE', 'BACKLOG', 'FULL']);
const CIA_MANUAL_PAUSE_MODES = new Set(['HUMAN_ONLY', 'SUSPENDED']);

function isCiaAutonomyActive(autonomy: Record<string, unknown> | null | undefined): boolean {
  const mode = String(autonomy?.mode || 'OFF').toUpperCase();
  const reason = String(autonomy?.reason || '');
  const isActive = CIA_ACTIVE_MODES.has(mode);
  const isManualPause = reason === 'manual_pause' || CIA_MANUAL_PAUSE_MODES.has(mode);
  return isActive && !isManualPause;
}

export function useWhatsAppSession({
  enabled = true,
  workspaceId: providedWorkspaceId,
  onConnectionChange,
}: UseWhatsAppSessionOptions = {}) {
  const resolveAuthToken = useCallback(() => tokenStorage.getToken() || '', []);
  const resolveWorkspaceId = useCallback(
    () => providedWorkspaceId || tokenStorage.getWorkspaceId() || '',
    [providedWorkspaceId],
  );
  const [authToken, setAuthToken] = useState<string>(resolveAuthToken);
  const [workspaceId, setWorkspaceId] = useState<string>(resolveWorkspaceId);
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const previousConnectedRef = useRef(false);
  const bootstrapGuardRef = useRef<string | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    },
    [],
  );

  const refreshCredentials = useCallback(() => {
    const nextToken = resolveAuthToken();
    const nextWorkspaceId = resolveWorkspaceId();
    setAuthToken((prev) => (prev === nextToken ? prev : nextToken));
    setWorkspaceId((prev) => (prev === nextWorkspaceId ? prev : nextWorkspaceId));
    return {
      authToken: nextToken,
      workspaceId: nextWorkspaceId,
    };
  }, [resolveAuthToken, resolveWorkspaceId]);

  const tryRecoverAuthenticatedWorkspaceCredentials = useCallback(
    async (authTokenValue: string) => {
      try {
        const recoveredWorkspaceId = await recoverAuthenticatedWorkspaceId();
        if (recoveredWorkspaceId) {
          tokenStorage.setWorkspaceId(recoveredWorkspaceId);
          setWorkspaceId(recoveredWorkspaceId);
          return {
            authToken: authTokenValue,
            workspaceId: providedWorkspaceId || recoveredWorkspaceId,
          };
        }
      } catch (error) {
        console.error('Failed to recover authenticated workspace:', error);
        tokenStorage.clear();
        setAuthToken('');
        setWorkspaceId('');
      }
      const refreshedAfterClear = refreshCredentials();
      if (refreshedAfterClear.authToken && !refreshedAfterClear.workspaceId) {
        throw new Error('Workspace não carregado. Recarregue a página para sincronizar sua conta.');
      }
      return null;
    },
    [providedWorkspaceId, refreshCredentials],
  );

  const fallbackToAnonymousCredentials = useCallback(async () => {
    const anonymous = await ensureAnonymousSession();
    const nextWorkspaceId = providedWorkspaceId || anonymous.workspaceId;
    setAuthToken(anonymous.token);
    setWorkspaceId(nextWorkspaceId);
    return {
      authToken: anonymous.token,
      workspaceId: nextWorkspaceId,
    };
  }, [providedWorkspaceId]);

  const ensureSessionCredentials = useCallback(async () => {
    const current = refreshCredentials();
    if (current.authToken && current.workspaceId) {
      return current;
    }

    if (current.authToken && !current.workspaceId) {
      const recovered = await tryRecoverAuthenticatedWorkspaceCredentials(current.authToken);
      if (recovered) return recovered;
    }

    return fallbackToAnonymousCredentials();
  }, [
    fallbackToAnonymousCredentials,
    refreshCredentials,
    tryRecoverAuthenticatedWorkspaceCredentials,
  ]);

  const requireSessionCredentials = useCallback(async () => {
    const current = await ensureSessionCredentials();
    if (!current.workspaceId || !current.authToken) {
      throw new Error('Workspace não carregado. Tente novamente.');
    }
    return current;
  }, [ensureSessionCredentials]);

  useEffect(() => {
    if (!enabled || !authToken || workspaceId) return;

    let cancelled = false;

    const recoverAuthenticatedWorkspace = async () => {
      try {
        const me = await authApi.getMe();
        const recoveredWorkspaceId = resolveWorkspaceFromAuthPayload(me.data)?.id || '';

        if (!cancelled && recoveredWorkspaceId) {
          tokenStorage.setWorkspaceId(recoveredWorkspaceId);
          setWorkspaceId(recoveredWorkspaceId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to recover workspace on session hook mount:', error);
        }
      }
    };

    void recoverAuthenticatedWorkspace();

    return () => {
      cancelled = true;
    };
  }, [authToken, enabled, workspaceId]);

  const loadStatus = useCallback(async () => {
    if (!enabled) return;
    const current = refreshCredentials();
    if (!current.workspaceId || !current.authToken) return;

    try {
      const data = sanitizeWhatsAppStatus(await getWhatsAppStatus(current.workspaceId));
      setStatus(data);
      setQrCode(null);
      setConnecting(isPendingQrStatus(data.status) && !data.connected);
      setStatusMessage(
        data.connected
          ? 'Sessão ativa e sincronizada.'
          : data.authUrl
            ? 'Conexão oficial da Meta pendente. Abra o fluxo para concluir o vínculo do canal.'
          : isPendingQrStatus(data.status)
            ? 'Conexão pendente. Abra o fluxo oficial da Meta.'
            : 'WhatsApp desconectado.',
      );
      setError(null);
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
      setStatus({ connected: false, status: 'disconnected' });
      setStatusMessage('Não foi possível carregar o status agora.');
    }
  }, [enabled, refreshCredentials]);

  const connect = useCallback(async () => {
    setLoading(true);
    setConnecting(true);
    setError(null);
    setQrCode(null);
    setStatusMessage(null);

    try {
      const current = await ensureSessionCredentials();
      const currentStatus = sanitizeWhatsAppStatus(await getWhatsAppStatus(current.workspaceId));
      if (currentStatus.connected) {
        setStatus(currentStatus);
        setConnecting(false);
        setStatusMessage('Sessão já estava conectada.');
        return;
      }

      if (currentStatus.authUrl) {
        setStatus(currentStatus);
        setStatusMessage('Abrindo fluxo oficial da Meta...');
        window.location.assign(currentStatus.authUrl);
        return;
      }

      if (isPendingQrStatus(currentStatus.status)) {
        setStatus(currentStatus);
        setStatusMessage(
          currentStatus.message || 'O runtime legado foi descontinuado. Abra o fluxo oficial da Meta.',
        );
        setConnecting(false);
        return;
      }

      const response: WhatsAppConnectResponse = await initiateWhatsAppConnection(
        current.workspaceId,
      );

      if (response.error || response.status === 'error') {
        setError(response.message || 'Falha ao iniciar conexão.');
        setConnecting(false);
        return;
      }

      if (response.status === 'already_connected') {
        setConnecting(false);
        setStatusMessage('Sessão já estava conectada.');
        await loadStatus();
        return;
      }

      if (response.status === 'connect_required' && response.authUrl) {
        setStatusMessage(response.message || 'Abrindo fluxo oficial da Meta...');
        window.location.assign(response.authUrl);
        return;
      }

      setStatusMessage('Conexão iniciada. Abra o fluxo oficial da Meta para concluir o vínculo.');
    } catch (err) {
      console.error('Failed to initiate connection:', err);
      setError('Falha ao iniciar a conexão oficial da Meta. Tente novamente.');
      setConnecting(false);
    } finally {
      setLoading(false);
    }
  }, [ensureSessionCredentials, loadStatus]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await disconnectWhatsApp(current.workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage('Sessão desconectada.');
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError('Falha ao desconectar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const reset = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await logoutWhatsApp(current.workspaceId);
      setStatus({ connected: false, status: 'disconnected' });
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage('Sessão resetada. Gere um novo fluxo oficial da Meta para reconectar.');
    } catch (err) {
      console.error('Failed to reset WhatsApp session:', err);
      setError('Falha ao resetar a sessão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const pauseAutonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await whatsappApi.startBacklog('pause_autonomy');
      if (response.error) {
        throw new Error(response.error);
      }
      setIsPaused(true);
      setStatusMessage('IA pausada. O WhatsApp continua conectado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao pausar a IA.');
    } finally {
      setLoading(false);
    }
  }, []);

  const resumeAutonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await autostartCia(current.workspaceId);
      setIsPaused(false);
      setStatusMessage('IA retomada. O atendimento automático voltou a agir.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao retomar a IA.');
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const shouldSkipCiaRuntimeSync = useCallback((): boolean => {
    if (!enabled || !workspaceId || !authToken || !status?.connected) return true;
    if (bootstrapGuardRef.current === workspaceId) return true;
    return false;
  }, [authToken, enabled, status?.connected, workspaceId]);

  const resumeCiaAutomation = useCallback(async (activeWorkspaceId: string): Promise<void> => {
    const surface = await ciaApi.getSurface(activeWorkspaceId);
    const autonomy = (surface.error ? null : surface.data?.autonomy) as
      | Record<string, unknown>
      | null
      | undefined;

    setIsPaused(false);

    if (isCiaAutonomyActive(autonomy)) {
      return;
    }

    await autostartCia(activeWorkspaceId);
    setIsPaused(false);
    setStatusMessage('Sessão ativa. A autonomia total foi retomada automaticamente.');
  }, []);

  const syncConnectedSessionRuntime = useCallback(async () => {
    if (shouldSkipCiaRuntimeSync()) return;

    bootstrapGuardRef.current = workspaceId;

    try {
      await resumeCiaAutomation(workspaceId);
    } catch (err) {
      console.error('Failed to sync CIA runtime for connected session:', err);
      bootstrapGuardRef.current = null;
    }
  }, [resumeCiaAutomation, shouldSkipCiaRuntimeSync, workspaceId]);

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  useEffect(() => {
    const syncCredentials = () => {
      refreshCredentials();
    };

    window.addEventListener('storage', syncCredentials);
    window.addEventListener('kloel-storage-changed', syncCredentials);

    return () => {
      window.removeEventListener('storage', syncCredentials);
      window.removeEventListener('kloel-storage-changed', syncCredentials);
    };
  }, [refreshCredentials]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) return;
    void loadStatus();
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken) return;
    const interval = setInterval(() => {
      void loadStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !authToken || !connecting || status?.connected) return;
    const interval = setInterval(() => {
      void loadStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [authToken, connecting, enabled, loadStatus, status?.connected, workspaceId]);

  useEffect(() => {
    if (!status?.connected) {
      bootstrapGuardRef.current = null;
      return;
    }

    void syncConnectedSessionRuntime();
  }, [status?.connected, syncConnectedSessionRuntime]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: workspaceId change is the intentional trigger to reset the bootstrap guard ref so the new workspace can bootstrap
  useEffect(() => {
    bootstrapGuardRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    const connected = !!status?.connected;
    if (connected === previousConnectedRef.current) return;
    previousConnectedRef.current = connected;
    onConnectionChange?.(connected);
  }, [onConnectionChange, status?.connected]);

  return {
    workspaceId,
    status,
    connected: !!status?.connected,
    qrCode,
    loading,
    connecting,
    error,
    isPaused,
    statusMessage,
    connect,
    disconnect,
    reset,
    loadStatus,
    pauseAutonomy,
    resumeAutonomy,
  };
}

export default useWhatsAppSession;
