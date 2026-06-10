import type { FormState } from './types';

function normalizeLocalizedNumberInput(input: string): string {
  const compact = input.trim().replace(/\s/g, '');
  const commaIndex = compact.lastIndexOf(',');
  const dotIndex = compact.lastIndexOf('.');

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';

    return compact.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  }

  if (commaIndex >= 0) {
    return compact.replace(',', '.');
  }

  return compact;
}

function parseNumberOrFallback(input: string, fallback: number): number {
  const value = Number.parseFloat(normalizeLocalizedNumberInput(input));
  return Number.isFinite(value) ? value : fallback;
}

export function formatLocalizedCurrency(input: string): string {
  const value = parseNumberOrFallback(input, 0);

  return `R$ ${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value)}`;
}

export function formatLocalizedPercent(input: string): string {
  const value = parseNumberOrFallback(input, Number.NaN);

  if (!Number.isFinite(value)) {
    return '';
  }

  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;
}

function parseIntOrFallback(input: string, fallback: number): number {
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalFloat(input: string): number | undefined {
  const value = parseNumberOrFallback(input, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

export function mergeProductTags(existingTags: string[], input: string, maxTags = 5): string[] {
  const tags = [...existingTags];
  const seen = new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean));

  for (const candidate of input.split(',')) {
    const tag = candidate.trim();
    const key = tag.toLocaleLowerCase();

    if (!tag || seen.has(key) || tags.length >= maxTags) {
      continue;
    }

    tags.push(tag);
    seen.add(key);
  }

  return tags;
}

export type ProductCreateStepValidation =
  | { ok: true }
  | { ok: false; step: number; message: string };

export function validateProductCreateStep(
  form: FormState,
  step: number,
): ProductCreateStepValidation {
  if (step === 1) {
    if (!form.name.trim()) {
      return { ok: false, step: 1, message: 'Informe o nome do produto antes de continuar.' };
    }

    if (!form.description.trim()) {
      return { ok: false, step: 1, message: 'Informe a descricao do produto antes de continuar.' };
    }

    if (!form.category.trim()) {
      return { ok: false, step: 1, message: 'Selecione uma categoria antes de continuar.' };
    }
  }

  if (step === 2) {
    const priceText = form.price.trim();

    if (!priceText) {
      return { ok: false, step: 2, message: 'Informe o preco do produto antes de continuar.' };
    }

    const price = parseNumberOrFallback(priceText, Number.NaN);

    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, step: 2, message: 'Informe um preco valido antes de continuar.' };
    }
  }

  const needsPhysicalLogistics = form.format === 'PHYSICAL' || form.format === 'HYBRID';

  if (needsPhysicalLogistics && step === 3) {
    if (!form.packageType.trim()) {
      return { ok: false, step: 3, message: 'Informe o tipo de embalagem antes de continuar.' };
    }

    const dimensions = [form.width, form.height, form.depth].map((value) =>
      parseNumberOrFallback(value, Number.NaN),
    );
    if (!dimensions.every((value) => Number.isFinite(value) && value > 0)) {
      return {
        ok: false,
        step: 3,
        message: 'Informe dimensoes validas da embalagem antes de continuar.',
      };
    }

    const weight = parseNumberOrFallback(form.weight, Number.NaN);
    if (!Number.isFinite(weight) || weight <= 0) {
      return {
        ok: false,
        step: 3,
        message: 'Informe um peso valido da embalagem antes de continuar.',
      };
    }
  }

  if (needsPhysicalLogistics && step === 4) {
    const dispatchTime = parseIntOrFallback(form.dispatchTime, Number.NaN);
    if (!Number.isFinite(dispatchTime) || dispatchTime <= 0) {
      return { ok: false, step: 4, message: 'Informe o prazo de postagem antes de continuar.' };
    }

    if (form.carriers.length === 0) {
      return { ok: false, step: 4, message: 'Selecione ao menos uma transportadora antes de continuar.' };
    }
  }

  if (step === 5 && form.affiliatesEnabled) {
    const commissionText = form.affiliateCommissionPercent.trim();

    if (!commissionText) {
      return { ok: false, step: 5, message: 'Informe a comissao do afiliado antes de continuar.' };
    }

    const commission = parseNumberOrFallback(commissionText, Number.NaN);

    if (!Number.isFinite(commission) || commission < 1 || commission > 100) {
      return {
        ok: false,
        step: 5,
        message: 'Informe uma comissao de afiliado valida entre 1 e 100.',
      };
    }
  }

  return { ok: true };
}


export function validateProductCreateFlow(
  form: FormState,
  steps: readonly number[],
): ProductCreateStepValidation {
  for (const step of steps) {
    const validation = validateProductCreateStep(form, step);

    if (!validation.ok) {
      return validation;
    }
  }

  return { ok: true };
}



/** Build product create payload. */
export function buildProductCreatePayload(
  form: FormState,
  workspaceId: string,
  needsPhysical: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    workspaceId,
    name: form.name.trim(),
    description: form.description,
    category: form.category,
    tags: form.tags,
    format: form.format,
    imageUrl: form.imageUrl || undefined,
    price: parseNumberOrFallback(form.price, 0),
    paymentType: form.paymentType,
    affiliateCommission: parseNumberOrFallback(form.affiliateCommission, 0),
    salesPageUrl: form.salesPageUrl || undefined,
    guaranteeDays: parseIntOrFallback(form.guaranteeDays, 30),
    checkoutType: form.checkoutType,
    facebookPixelId: form.facebookPixelId || undefined,
    googleTagManagerId: form.googleTagManagerId || undefined,
    affiliatesEnabled: form.affiliatesEnabled,
    affiliateCommissionPercent: parseNumberOrFallback(form.affiliateCommissionPercent, 0),
    affiliateApprovalMode: form.affiliateApprovalMode,
    billingType: form.billingType,
    maxInstallments: parseIntOrFallback(form.maxInstallments, 12),
    interestFreeInstallments: parseIntOrFallback(form.interestFreeInstallments, 1),
    status: 'PENDING',
  };

  if (!needsPhysical) {
    return base;
  }

  return {
    ...base,
    packageType: form.packageType || undefined,
    width: parseOptionalFloat(form.width),
    height: parseOptionalFloat(form.height),
    depth: parseOptionalFloat(form.depth),
    weight: parseOptionalFloat(form.weight),
    shippingResponsible: form.shippingResponsible,
    dispatchTime: parseIntOrFallback(form.dispatchTime, 3),
    carriers: form.carriers,
  };
}

/** Extract created product id. */
export function extractCreatedProductId(
  response: Record<string, unknown> | null,
): string | undefined {
  if (!response) {
    return undefined;
  }
  const productField =
    typeof response === 'object' && 'product' in response
      ? (response.product as Record<string, unknown> | null)
      : null;
  const created = productField || response;
  if (!created || typeof created !== 'object') {
    return undefined;
  }
  return 'id' in created ? ((created as { id?: unknown }).id as string | undefined) : undefined;
}
