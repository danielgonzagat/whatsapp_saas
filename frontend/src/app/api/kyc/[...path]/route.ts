import { NextRequest, NextResponse } from "next/server";
import { getBackendCandidateUrls } from "../../_lib/backend-url";

/**
 * Catch-all proxy for /api/kyc/* -> backend /kyc/*
 * Mirrors the same pattern used by /api/workspace/me and /api/auth/*.
 * This ensures KYC calls go through the same-origin Next.js server,
 * avoiding CORS / NEXT_PUBLIC_API_URL misconfiguration issues.
 */

async function proxyKyc(request: NextRequest, pathSegments: string[]) {
  const kycPath = `/kyc/${pathSegments.join("/")}`;

  const authHeader = request.headers.get("authorization") || "";
  const workspaceId =
    request.headers.get("x-workspace-id") ||
    request.headers.get("x-kloel-workspace-id") ||
    "";

  const contentType = request.headers.get("content-type") || "";
  const isFormData = contentType.includes("multipart/form-data");

  const headers: Record<string, string> = {
    Authorization: authHeader,
    "x-workspace-id": workspaceId,
    Accept: "application/json",
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let body: BodyInit | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = isFormData ? await request.arrayBuffer() : await request.text().catch(() => null);
    if (isFormData) {
      headers["Content-Type"] = contentType;
    }
  }

  let lastError: unknown;

  for (const baseUrl of getBackendCandidateUrls()) {
    const url = `${baseUrl}${kycPath}`;
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    }).catch((error) => {
      lastError = error;
      return null;
    });

    if (!response) continue;
    if (response.status === 404 || response.status === 405) {
      lastError = new Error(`upstream ${response.status} at ${url}`);
      continue;
    }

    const responseContentType = response.headers.get("content-type") || "";
    if (responseContentType.includes("application/json")) {
      const data = await response.json().catch(() => ({}));
      return NextResponse.json(data, { status: response.status });
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      status: response.status,
      headers: { "Content-Type": responseContentType },
    });
  }

  console.error("[KYC Proxy] all backends failed:", lastError);
  return NextResponse.json(
    { message: "Falha ao conectar com o servidor." },
    { status: 502 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyKyc(request, path);
}
