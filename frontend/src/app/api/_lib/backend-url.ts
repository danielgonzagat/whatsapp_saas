const DEFAULT_BACKEND_URL = "https://whatsappsaas-copy-production.up.railway.app";

function hasProtocol(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function isLocalHostLike(value: string) {
  const candidate = value
    .trim()
    .replace(/^\/+/, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();

  return (
    candidate === "localhost" ||
    candidate === "127.0.0.1" ||
    candidate === "0.0.0.0"
  );
}

export function normalizeBackendUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return "";

  const normalizedInput = hasProtocol(raw)
    ? raw
    : raw.startsWith("//")
      ? `https:${raw}`
      : `${isLocalHostLike(raw) ? "http" : "https"}://${raw.replace(/^\/+/, "")}`;

  try {
    return new URL(normalizedInput).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function getBackendUrl() {
  return (
    normalizeBackendUrl(process.env.BACKEND_URL) ||
    normalizeBackendUrl(process.env.NEXT_PUBLIC_API_URL) ||
    DEFAULT_BACKEND_URL
  ).replace(/\/+$/, "");
}

export function getBackendCandidateUrls() {
  const bases = [
    normalizeBackendUrl(process.env.BACKEND_URL),
    normalizeBackendUrl(process.env.NEXT_PUBLIC_API_URL),
    DEFAULT_BACKEND_URL,
  ].filter(Boolean);

  const candidates: string[] = [];
  for (const base of [...new Set(bases)]) {
    candidates.push(base);
    if (!base.endsWith("/api")) {
      candidates.push(`${base}/api`);
    }
  }

  return [...new Set(candidates.map((value) => value.replace(/\/+$/, "")))];
}
