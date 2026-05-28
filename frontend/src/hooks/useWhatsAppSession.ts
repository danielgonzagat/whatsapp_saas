'use client';

import { ensureAnonymousSession } from '@/lib/anonymous-session';
import {
  type WhatsAppConnectResponse,
  type WhatsAppConnectionStatus,
  authApi,
  autostartCia,
  ciaApi,
  disconnectWhatsApp,
  getWhatsAppQR,
  getWhatsAppStatus,
  initiateWhatsAppConnection,
  logoutWhatsApp,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
  whatsappApi,
} from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POLL_INTERVALS,
  SESSION_COPY,
  SESSION_LOG,
  TIMEOUTS,
  buildDisconnectedStatus,
  classifyConnectResponse,
  createSessionError,
  hasCompleteCredentials,
  hasConnectionStateChanged,
  isCiaAutonomyActive,
  isPendingQrStatus,
  isQrPollEnabled,
  isSessionPollEnabled,
  needsWorkspaceRecovery,
  pickRecoveredWorkspaceId,
  resolveStatusMessage,
  selectQrCodeFromResponse,
  shouldSkipCiaRuntimeSync as shouldSkipCiaRuntimeSyncHelper,
} from './useWhatsAppSession.helpers';

interface UseWhatsAppSessionOptions {
  enabled?: boolean;
  workspaceId?: string;
  onConnectionChange?: ((connected: boolean) => void) | undefined;
}

async function recoverAuthenticatedWorkspaceId(): Promise<string> {
  const me = await authApi.getMe();
  return pickRecoveredWorkspaceId(me.data, resolveWorkspaceFromAuthPayload);
}

/** Use whats app session. */
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
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
      }
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
        console.error(SESSION_LOG.recoverWorkspace, error);
        tokenStorage.clear();
        setAuthToken('');
        setWorkspaceId('');
      }
      const refreshedAfterClear = refreshCredentials();
      if (refreshedAfterClear.authToken && !refreshedAfterClear.workspaceId) {
        throw createSessionError(SESSION_COPY.workspaceReload);
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
    if (hasCompleteCredentials(current)) {
      return current;
    }

    if (needsWorkspaceRecovery(current)) {
      const recovered = await tryRecoverAuthenticatedWorkspaceCredentials(current.authToken);
      if (recovered) {
        return recovered;
      }
    }

    return fallbackToAnonymousCredentials();
  }, [
    fallbackToAnonymousCredentials,
    refreshCredentials,
    tryRecoverAuthenticatedWorkspaceCredentials,
  ]);

  const requireSessionCredentials = useCallback(async () => {
    const current = await ensureSessionCredentials();
    if (!hasCompleteCredentials(current)) {
      throw createSessionError(SESSION_COPY.workspaceRetry);
    }
    return current;
  }, [ensureSessionCredentials]);

  useEffect(() => {
    if (!enabled || !authToken || workspaceId) {
      return;
    }

    let cancelled = false;

    const recoverAuthenticatedWorkspace = async () => {
      try {
        const me = await authApi.getMe();
        const recoveredWorkspaceId = pickRecoveredWorkspaceId(
          me.data,
          resolveWorkspaceFromAuthPayload,
        );

        if (!cancelled && recoveredWorkspaceId) {
          tokenStorage.setWorkspaceId(recoveredWorkspaceId);
          setWorkspaceId(recoveredWorkspaceId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(SESSION_LOG.recoverWorkspaceOnMount, error);
        }
      }
    };

    void recoverAuthenticatedWorkspace();

    return () => {
      cancelled = true;
    };
  }, [authToken, enabled, workspaceId]);

  const loadStatus = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const current = refreshCredentials();
    if (!current.workspaceId || !current.authToken) {
      return;
    }

    try {
      const data = await getWhatsAppStatus(current.workspaceId);
      setStatus(data);
      setQrCode(data.qrCode || null);
      setConnecting(isPendingQrStatus(data.status) && !data.connected);
      setStatusMessage(
        resolveStatusMessage({
          connected: data.connected,
          ...(data.status != null ? { status: data.status } : {}),
        }),
      );
      setError(null);
    } catch (err) {
      console.error(SESSION_LOG.loadStatus, err);
      setStatus(buildDisconnectedStatus());
      setStatusMessage(SESSION_COPY.loadStatusFailed);
    }
  }, [enabled, refreshCredentials]);

  const loadQR = useCallback(async () => {
    if (!enabled) {
      return;
    }
    const current = refreshCredentials();
    if (!current.workspaceId || !current.authToken) {
      return;
    }

    try {
      const data = await getWhatsAppQR(current.workspaceId);
      if (data.qrCode) {
        setQrCode(data.qrCode);
        setStatusMessage(data.message || SESSION_COPY.scanQr);
      }

      if (data.connected) {
        setStatusMessage(SESSION_COPY.connectedSuccess);
        setConnecting(false);
        await loadStatus();
      }
    } catch (err) {
      console.error(SESSION_LOG.loadQr, err);
      setError(SESSION_COPY.qrRefreshRetry);
      setConnecting(false);
    }
  }, [enabled, loadStatus, refreshCredentials]);

  const connect = useCallback(async () => {
    setLoading(true);
    setConnecting(true);
    setError(null);
    setQrCode(null);
    setStatusMessage(null);

    try {
      const current = await ensureSessionCredentials();
      const currentStatus = await getWhatsAppStatus(current.workspaceId);
      if (currentStatus.connected) {
        setStatus(currentStatus);
        setConnecting(false);
        setStatusMessage(SESSION_COPY.alreadyConnected);
        return;
      }

      if (isPendingQrStatus(currentStatus.status)) {
        setStatus(currentStatus);
        setQrCode(selectQrCodeFromResponse(currentStatus));
        setStatusMessage(currentStatus.message || SESSION_COPY.scanQr);
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current);
        }
        connectTimerRef.current = setTimeout(() => {
          void loadQR();
        }, TIMEOUTS.qrGenerationMs);
        return;
      }

      const response: WhatsAppConnectResponse = await initiateWhatsAppConnection(
        current.workspaceId,
      );

      const outcome = classifyConnectResponse(response);

      if (outcome.kind === 'error') {
        setError(outcome.message);
        setConnecting(false);
        return;
      }

      if (outcome.kind === 'already_connected') {
        setConnecting(false);
        setStatusMessage(SESSION_COPY.alreadyConnected);
        await loadStatus();
        return;
      }

      if (outcome.kind === 'qr_ready') {
        setQrCode(outcome.qrCode);
        setStatusMessage(outcome.message);
        return;
      }

      setTimeout(() => {
        void loadQR();
      }, TIMEOUTS.connectFeedbackMs);
    } catch (err) {
      console.error(SESSION_LOG.connect, err);
      setError(SESSION_COPY.connectRetry);
      setConnecting(false);
    } finally {
      setLoading(false);
    }
  }, [ensureSessionCredentials, loadQR, loadStatus]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await requireSessionCredentials();
      await disconnectWhatsApp(current.workspaceId);
      setStatus(buildDisconnectedStatus());
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage(SESSION_COPY.disconnectSuccess);
    } catch (err) {
      console.error(SESSION_LOG.disconnect, err);
      setError(SESSION_COPY.disconnectRetry);
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
      setStatus(buildDisconnectedStatus());
      setQrCode(null);
      setConnecting(false);
      setIsPaused(false);
      setStatusMessage(SESSION_COPY.resetSuccess);
    } catch (err) {
      console.error(SESSION_LOG.reset, err);
      setError(SESSION_COPY.resetRetry);
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
        throw createSessionError(response.error);
      }
      setIsPaused(true);
      setStatusMessage(SESSION_COPY.pauseSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : SESSION_COPY.pauseRetry);
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
      setStatusMessage(SESSION_COPY.resumeSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : SESSION_COPY.resumeRetry);
    } finally {
      setLoading(false);
    }
  }, [requireSessionCredentials]);

  const shouldSkipCiaRuntimeSync = useCallback(
    (): boolean =>
      shouldSkipCiaRuntimeSyncHelper({
        enabled,
        workspaceId,
        authToken,
        connected: Boolean(status?.connected),
        guardedWorkspaceId: bootstrapGuardRef.current,
      }),
    [authToken, enabled, status?.connected, workspaceId],
  );

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
    setStatusMessage(SESSION_COPY.runtimeResumeSuccess);
  }, []);

  const syncConnectedSessionRuntime = useCallback(async () => {
    if (shouldSkipCiaRuntimeSync()) {
      return;
    }

    bootstrapGuardRef.current = workspaceId;

    try {
      await resumeCiaAutomation(workspaceId);
    } catch (err) {
      console.error(SESSION_LOG.syncRuntime, err);
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
    if (!isSessionPollEnabled({ enabled, workspaceId, authToken })) {
      return;
    }
    void loadStatus();
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    if (!isSessionPollEnabled({ enabled, workspaceId, authToken })) {
      return;
    }
    const interval = setInterval(() => {
      void loadStatus();
    }, POLL_INTERVALS.statusMs);
    return () => clearInterval(interval);
  }, [authToken, enabled, loadStatus, workspaceId]);

  useEffect(() => {
    const connected = Boolean(status?.connected);
    if (!isQrPollEnabled({ enabled, workspaceId, authToken, connecting, connected })) {
      return;
    }
    const interval = setInterval(() => {
      void loadQR();
    }, POLL_INTERVALS.qrMs);
    return () => clearInterval(interval);
  }, [authToken, connecting, enabled, loadQR, status?.connected, workspaceId]);

  useEffect(() => {
    if (!status?.connected) {
      bootstrapGuardRef.current = null;
      return;
    }

    void syncConnectedSessionRuntime();
  }, [status?.connected, syncConnectedSessionRuntime]);

  useEffect(() => {
    bootstrapGuardRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    const connected = !!status?.connected;
    if (!hasConnectionStateChanged(previousConnectedRef.current, connected)) {
      return;
    }
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
