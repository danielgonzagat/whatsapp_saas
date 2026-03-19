import { NextRequest } from "next/server";
import { getBackendCandidateUrls } from "../_lib/backend-url";

function buildHeaders(
  request: NextRequest,
  options?: { body?: string; accept?: string },
) {
  const headers: Record<string, string> = {
    Accept: options?.accept || "application/json",
  };

  const authorization = request.headers.get("authorization");
  const workspaceId = request.headers.get("x-workspace-id");

  if (authorization) {
    headers.Authorization = authorization;
  }
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }
  if (options?.body) {
    headers["Content-Type"] =
      request.headers.get("content-type") || "application/json";
  }

  return headers;
}

async function fetchWhatsAppUpstream(
  request: NextRequest,
  method: "GET" | "POST" | "DELETE",
  upstreamPath: string,
  options?: { accept?: string },
) {
  const rawBody = method === "GET" ? undefined : await request.text();
  const headers = buildHeaders(request, {
    body: rawBody,
    accept: options?.accept,
  });
  let lastError: unknown;

  for (const baseUrl of getBackendCandidateUrls()) {
    const url = `${baseUrl}${upstreamPath}`;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: rawBody || undefined,
        cache: "no-store",
      });

      if (response.status === 404 || response.status === 405) {
        lastError = new Error(`upstream ${response.status} at ${url}`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach upstream WhatsApp endpoint");
}

export async function proxyWhatsAppRequest(
  request: NextRequest,
  method: "GET" | "POST" | "DELETE",
  upstreamPath: string,
) {
  if (!getBackendCandidateUrls().length) {
    throw new Error(
      "BACKEND_URL/NEXT_PUBLIC_API_URL não configurado para o proxy WhatsApp",
    );
  }
  const response = await fetchWhatsAppUpstream(request, method, upstreamPath);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export async function proxyWhatsAppStream(
  request: NextRequest,
  upstreamPath: string,
) {
  if (!getBackendCandidateUrls().length) {
    throw new Error(
      "BACKEND_URL/NEXT_PUBLIC_API_URL não configurado para o proxy WhatsApp",
    );
  }

  const response = await fetchWhatsAppUpstream(request, "GET", upstreamPath, {
    accept: "text/event-stream",
  });

  if (!response.body) {
    throw new Error("WhatsApp SSE upstream returned no body");
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("Connection", "keep-alive");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
