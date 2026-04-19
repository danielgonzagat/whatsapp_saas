export interface UpsellData {
  id: string;
  title: string;
  headline: string;
  description: string;
  productName: string;
  image?: string;
  priceInCents: number;
  compareAtPrice?: number;
  acceptBtnText?: string;
  declineBtnText?: string;
  timerSeconds?: number;
  chargeType: 'ONE_CLICK' | 'NEW_PAYMENT';
}

export interface OrderUpsellsResponse {
  upsells: UpsellData[];
  currentIndex: number;
}

export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseUpsellsQuery(raw: string | null): UpsellData[] | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as UpsellData[];
  } catch {
    return null;
  }
}
