import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { digitsOnly } from './kyc.helpers';

/**
 * Descriptive User-Agent + Accept headers for Brazil public-data providers
 * (BrasilAPI / ViaCEP).
 *
 * BrasilAPI sits behind Cloudflare, which returns 403 for the bare `node`
 * runtime User-Agent and 429 for an empty one — only a descriptive UA gets a
 * 200. Without these headers every CNPJ/bank lookup fails and the fiscal
 * auto-fill silently returns "nao encontrado". Keep this shared so all three
 * lookups stay consistent.
 */
export const BRASIL_PROVIDER_HEADERS = {
  'User-Agent': 'Kloel/1.0 (+https://kloel.com)',
  Accept: 'application/json',
} as const;

const logger = new Logger('KycLookup');

/** Timeout (ms) for BR public-data provider calls — REGRA DE INTEGRAÇÕES EXTERNAS. */
const BRASIL_PROVIDER_TIMEOUT_MS = 8000;

/**
 * Fetch a BR public-data provider with the descriptive headers and a hard
 * timeout. On timeout the request is aborted and the caller maps the rejection
 * to a 503 honest-degraded state. Uses AbortController + setTimeout for
 * Node-version portability (AbortSignal.timeout needs Node >= 17.3).
 */
async function fetchBrazilProvider(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRASIL_PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: BRASIL_PROVIDER_HEADERS, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Public CNPJ lookup via BrasilAPI (fiscal auto-fill). */
export async function lookupCnpj(cnpj: string): Promise<unknown> {
  const clean = digitsOnly(cnpj) ?? '';
  if (clean.length !== 14) {
    throw new BadRequestException('CNPJ invalido');
  }

  try {
    const response = await fetchBrazilProvider(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (!response.ok) {
      throw new BadRequestException('CNPJ nao encontrado ou invalido');
    }
    return response.json();
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    logger.warn(`CNPJ lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw new ServiceUnavailableException('Consulta de CNPJ indisponivel');
  }
}

/** Public CEP address lookup via ViaCEP (fiscal auto-fill). */
export async function lookupCep(cep: string): Promise<unknown> {
  const clean = digitsOnly(cep) ?? '';
  if (clean.length !== 8) {
    throw new BadRequestException('CEP invalido');
  }

  try {
    const response = await fetchBrazilProvider(`https://viacep.com.br/ws/${clean}/json/`);
    if (!response.ok) {
      throw new BadRequestException('CEP nao encontrado ou invalido');
    }
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'erro' in data && data.erro === true) {
      throw new BadRequestException('CEP nao encontrado ou invalido');
    }
    return data;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    logger.warn(`CEP lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw new ServiceUnavailableException('Consulta de CEP indisponivel');
  }
}

/** Public Brazilian bank list via BrasilAPI (bank-account selection). */
export async function listBrazilianBanks(): Promise<
  Array<{ code: number; name: string; fullName: string; ispb: string }>
> {
  try {
    const response = await fetchBrazilProvider('https://brasilapi.com.br/api/banks/v1');
    if (!response.ok) {
      throw new ServiceUnavailableException('Lista de bancos indisponivel');
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new ServiceUnavailableException('Lista de bancos indisponivel');
    }

    return data
      .flatMap((item): Array<{ code: number; name: string; fullName: string; ispb: string }> => {
        if (typeof item !== 'object' || item === null) {
          return [];
        }
        const record = item as Record<string, unknown>;
        const rawCode = record.code;
        const code =
          typeof rawCode === 'number'
            ? rawCode
            : typeof rawCode === 'string'
              ? Number(rawCode)
              : Number.NaN;
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const fullName = typeof record.fullName === 'string' ? record.fullName.trim() : name;
        const ispb = typeof record.ispb === 'string' ? record.ispb : '';
        if (!Number.isFinite(code) || code <= 0 || !name || !fullName) {
          return [];
        }
        return [{ code, name, fullName, ispb }];
      })
      .sort((a, b) => a.code - b.code);
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      throw error;
    }
    logger.warn(
      `Brazilian bank list lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    throw new ServiceUnavailableException('Lista de bancos indisponivel');
  }
}
