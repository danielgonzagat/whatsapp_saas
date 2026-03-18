const DEFAULT_BACKEND_URL = "https://whatsappsaas-copy-production.up.railway.app";

export function getBackendUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_BACKEND_URL
  ).replace(/\/+$/, "");
}