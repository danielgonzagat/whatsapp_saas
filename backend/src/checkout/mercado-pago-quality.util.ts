import { BadRequestException } from '@nestjs/common';
import { normalizeMercadoPagoPayerAddress } from '../kloel/mercado-pago-order.util';

const D_RE = /\D/g;

export type MercadoPagoCheckoutQualityGateInput = {
  customerName: string;
  customerEmail: string;
  customerCPF?: string;
  customerPhone?: string;
  shippingAddress?: unknown;
  meliSessionId?: string;
};

export type MercadoPagoCheckoutQualityGateResult = {
  documentDigits: string;
  phoneDigits: string;
  meliSessionId: string;
  payerAddress: NonNullable<ReturnType<typeof normalizeMercadoPagoPayerAddress>>;
};

function asDigits(value?: string | null) {
  return String(value || '').replace(D_RE, '');
}

function hasValue(value?: string | null) {
  return Boolean(String(value || '').trim());
}

export function assertMercadoPagoCheckoutQuality(
  input: MercadoPagoCheckoutQualityGateInput,
): MercadoPagoCheckoutQualityGateResult {
  if (!hasValue(input.customerName)) {
    throw new BadRequestException('Nome do comprador é obrigatório para o Mercado Pago.');
  }

  const email = String(input.customerEmail || '').trim();
  if (!email || !email.includes('@')) {
    throw new BadRequestException('Email válido é obrigatório para o Mercado Pago.');
  }

  const documentDigits = asDigits(input.customerCPF);
  if (![11, 14].includes(documentDigits.length)) {
    throw new BadRequestException(
      'CPF ou CNPJ válido é obrigatório para processar pagamentos com Mercado Pago.',
    );
  }

  const phoneDigits = asDigits(input.customerPhone);
  if (phoneDigits.length < 10) {
    throw new BadRequestException(
      'Telefone completo é obrigatório para processar pagamentos com Mercado Pago.',
    );
  }

  const meliSessionId = String(input.meliSessionId || '').trim();
  if (meliSessionId.length < 8) {
    throw new BadRequestException(
      'Não foi possível validar este dispositivo para o Mercado Pago. Atualize a página e tente novamente.',
    );
  }

  const payerAddress = normalizeMercadoPagoPayerAddress(input.shippingAddress);
  if (
    !payerAddress?.street_name ||
    !payerAddress?.street_number ||
    !payerAddress?.zip_code ||
    !payerAddress?.neighborhood ||
    !payerAddress?.city ||
    !payerAddress?.state
  ) {
    throw new BadRequestException(
      'Endereço completo é obrigatório para processar pagamentos com Mercado Pago.',
    );
  }

  return {
    documentDigits,
    phoneDigits,
    meliSessionId,
    payerAddress,
  };
}
