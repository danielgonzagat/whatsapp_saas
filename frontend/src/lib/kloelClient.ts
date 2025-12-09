import { apiUrl } from './http';

export function kloelUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return apiUrl(`/kloel${normalized}`);
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}
