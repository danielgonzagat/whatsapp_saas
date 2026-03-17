// frontend/src/lib/http.ts
// Centralizado para construir URLs da API

const isBrowser = typeof window !== 'undefined';

/**
 * 🎯 DETECÇÃO ROBUSTA DE API URL
 * Ordem de prioridade:
 * 1. NEXT_PUBLIC_API_URL (variável de ambiente - produção)
 * 2. BACKEND_URL (build-time)
 * 3. localhost:3001 (desenvolvimento local)
 * 4. Railway URL (fallback de produção)
 * 
 * NUNCA usa window.location.origin para evitar requisições erradas
 */
const getApiBase = (): string => {
  // 1) Variáveis de ambiente (prioridade máxima)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  
  // 2) Desenvolvimento local
  if (isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:3001';
  }
  
  // 3) Fallback de produção: Railway
  // IMPORTANTE: Não usar window.location.origin pois causaria requisições para o próprio frontend
  return 'https://whatsappsaas-copy-production.up.railway.app';
};

// Remove barras ao fim para não gerar // nas URLs
export const API_BASE = getApiBase().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
