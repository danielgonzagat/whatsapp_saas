"use client";

import { tokenStorage } from "./api";

type AnonymousSession = {
  token: string;
  workspaceId: string;
  refreshToken?: string;
  created: boolean;
};

function resolveAnonymousToken(payload: any): string {
  return String(
    payload?.access_token ||
      payload?.accessToken ||
      payload?.token ||
      "",
  ).trim();
}

function resolveAnonymousWorkspaceId(payload: any): string {
  return String(
    payload?.user?.workspaceId ||
      payload?.workspace?.id ||
      payload?.workspaceId ||
      "",
  ).trim();
}

export async function ensureAnonymousSession(): Promise<AnonymousSession> {
  const existingToken = tokenStorage.getToken();
  const existingWorkspaceId = tokenStorage.getWorkspaceId();

  if (existingToken && existingWorkspaceId) {
    return {
      token: existingToken,
      workspaceId: existingWorkspaceId,
      refreshToken: tokenStorage.getRefreshToken() || undefined,
      created: false,
    };
  }

  const response = await fetch("/api/auth/anonymous", { method: "POST" });
  if (!response.ok) {
    throw new Error("Falha ao criar sessão anônima.");
  }

  const payload = await response.json().catch(() => ({}));
  const token = resolveAnonymousToken(payload);
  const workspaceId = resolveAnonymousWorkspaceId(payload);
  const refreshToken = String(
    payload?.refresh_token || payload?.refreshToken || "",
  ).trim();

  if (!token || !workspaceId) {
    throw new Error("Resposta inválida ao criar sessão anônima.");
  }

  tokenStorage.setToken(token);
  tokenStorage.setWorkspaceId(workspaceId);
  if (refreshToken) {
    tokenStorage.setRefreshToken(refreshToken);
  }

  return {
    token,
    workspaceId,
    refreshToken: refreshToken || undefined,
    created: true,
  };
}
