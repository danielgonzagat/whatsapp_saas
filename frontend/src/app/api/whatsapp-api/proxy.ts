import { NextRequest } from "next/server";

const DEFAULT_BACKEND_URL = "https://whatsappsaas-copy-production.up.railway.app";

function normalizeBaseUrl(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/\/+$/, "");
}

function getCandidateBaseUrls() {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_API_URL,
    DEFAULT_BACKEND_URL,
  ]
    .map(normalizeBaseUrl)
    .filter(Boolean);

  return [...new Set(candidates)];
}

function buildHeaders(request: NextRequest) {
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

  return headers;
}

export async function proxyWhatsAppRequest(
  request: NextRequest,
  method: "GET" | "POST" | "DELETE",
  upstreamPath: string,
) {
  const candidates = getCandidateBaseUrls();
  const headers = buildHeaders(request);
  let lastError: unknown;

  for (const baseUrl of candidates) {
    const urls = [`${baseUrl}${upstreamPath}`];
    if (!baseUrl.endsWith("/api")) {
      urls.push(`${baseUrl}/api${upstreamPath}`);
    }

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method,
          headers,
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
  }

  throw lastError || new Error("Unable to reach upstream WhatsApp endpoint");
}