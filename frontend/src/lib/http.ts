// frontend/src/lib/http.ts
// Centralizado para construir URLs da API

const isBrowser = typeof window !== 'undefined';

const hasProtocol = (value: string) => /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);

const isLocalHostLike = (value: string) => {
  const candidate = value
    .trim()
    .replace(/^\/+/, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();

  return candidate === 'localhost' || candidate === '127.0.0.1' || candidate === '0.0.0.0';
};

const normalizeApiBase = (value: string | undefined): string => {
  const raw = value?.trim();
  if (!raw) return '';

  const normalizedInput = hasProtocol(raw)
    ? raw
    : raw.startsWith('//')
      ? `https:${raw}`
      : `${isLocalHostLike(raw) ? 'http' : 'https'}://${raw.replace(/^\/+/, '')}`;

  try {
    return new URL(normalizedInput).toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
};

/**
 * 🎯 DETECÇÃO ROBUSTA DE API URL
 * Ordem de prioridade:
 * 1. NEXT_PUBLIC_API_URL (variável de ambiente - produção)
 * 2. BACKEND_URL (build-time)
 * 3. localhost:3001 (desenvolvimento local)
 * 4. Mesmo origin atual (somente como fallback de emergência)
 * 
 * IMPORTANTE:
 * - Em produção, configure NEXT_PUBLIC_API_URL corretamente.
 * - O fallback same-origin só é seguro quando frontend e backend estão
 *   atrás do mesmo domínio/reverse proxy.
 */
const getApiBase = (): string => {
  // 1) Variáveis de ambiente (prioridade máxima)
  const publicApiUrl = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);
  if (publicApiUrl) {
    return publicApiUrl;
  }
  
  const backendUrl = normalizeApiBase(process.env.BACKEND_URL);
  if (backendUrl) {
    return backendUrl;
  }
  
  // 2) Desenvolvimento local
  if (isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:3001';
  }
  
  // 3) Fallback de emergência: mesmo origin atual
  if (isBrowser) {
    return normalizeApiBase(window.location.origin);
  }

  return '';
};

// Remove barras ao fim para não gerar // nas URLs
export const API_BASE = getApiBase().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
