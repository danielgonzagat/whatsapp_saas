// Pure helpers extracted from ProductNerveCenter.tsx to reduce cyclomatic
// complexity of the product-sync and plan-checkout-config sync useEffects.
// Behaviour is byte-identical to the original inline implementation.

export interface ProductSyncTargets {
  setEditName: (value: string) => void;
  setEditDesc: (value: string) => void;
  setEditCategory: (value: string) => void;
  setEditTags: (value: string) => void;
  setEditWarranty: (value: number) => void;
  setEditSalesUrl: (value: string) => void;
  setEditThankUrl: (value: string) => void;
  setEditThankPix: (value: string) => void;
  setEditThankBoleto: (value: string) => void;
  setEditReclame: (value: string) => void;
  setEditSupportEmail: (value: string) => void;
  setEditActive: (value: boolean) => void;
  setEditFormat: (value: string) => void;
}

export interface ProductSyncSource {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: unknown;
  warrantyDays?: number | null;
  salesPageUrl?: string | null;
  thankyouUrl?: string | null;
  thankyouPixUrl?: string | null;
  thankyouBoletoUrl?: string | null;
  reclameAquiUrl?: string | null;
  supportEmail?: string | null;
  active?: boolean | null;
  format?: string | null;
}

function toTagsString(tags: unknown): string {
  if (Array.isArray(tags)) return tags.join(', ');
  return typeof tags === 'string' ? tags : '';
}

export function applyProductSync(p: ProductSyncSource, targets: ProductSyncTargets): void {
  targets.setEditName(p.name || '');
  targets.setEditDesc(p.description || '');
  targets.setEditCategory(p.category || '');
  targets.setEditTags(toTagsString(p.tags));
  targets.setEditWarranty(Math.max(7, Number(p.warrantyDays || 7)));
  targets.setEditSalesUrl(p.salesPageUrl || '');
  targets.setEditThankUrl(p.thankyouUrl || '');
  targets.setEditThankPix(p.thankyouPixUrl || '');
  targets.setEditThankBoleto(p.thankyouBoletoUrl || '');
  targets.setEditReclame(p.reclameAquiUrl || '');
  targets.setEditSupportEmail(p.supportEmail || '');
  targets.setEditActive(p.active !== false);
  targets.setEditFormat(p.format || 'DIGITAL');
}
