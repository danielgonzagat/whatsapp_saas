import { NextRequest } from "next/server";
import { getBackendCandidateUrls } from "../_lib/backend-url";

function buildHeaders(request: NextRequest, body?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const authorization = request.headers.get("authorization");
  const workspaceId = request.headers.get("x-workspace-id");

  if (authorization) {
    headers.Authorization = authorization;
  }
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }
  if (body) {
    headers["Content-Type"] =
      request.headers.get("content-type") || "application/json";
  }

  return headers;
}

export async function proxyWhatsAppRequest(
  request: NextRequest,
  method: "GET" | "POST" | "DELETE",
  upstreamPath: string,
) {
  const candidates = getBackendCandidateUrls();
  if (!candidates.length) {
    throw new Error(
      "BACKEND_URL/NEXT_PUBLIC_API_URL não configurado para o proxy WhatsApp",
    );
  }
  const rawBody = method === "GET" ? undefined : await request.text();
  const headers = buildHeaders(request, rawBody);
  let lastError: unknown;

  for (const baseUrl of candidates) {
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

      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to reach upstream WhatsApp endpoint");
}
