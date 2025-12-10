// frontend/src/lib/http.ts
// Centralizado para construir URLs da API

const isBrowser = typeof window !== 'undefined';

// Usa NEXT_PUBLIC_API_URL se definida; senão tenta BACKEND_URL no build; 
// se ainda assim estiver vazio e estivermos no browser, usa o próprio domínio
const rawBase =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  (isBrowser ? window.location.origin : '');

if (!rawBase && process.env.NODE_ENV === 'production') {
  console.warn(
    '[HTTP] Variável NEXT_PUBLIC_API_URL não definida – utilizando domínio atual. Configure-a no ambiente de produção para evitar este fallback.'
  );
}

// remove barras ao fim para não gerar // nas URLs
export const API_BASE = rawBase.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
