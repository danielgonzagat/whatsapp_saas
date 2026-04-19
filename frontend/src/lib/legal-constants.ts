import type { Metadata } from 'next';

const DEFAULT_SITE_URL = 'https://kloel.com';
const DEFAULT_LAST_UPDATED = '2026-04-18';

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/g, '');
}

export const LEGAL_SITE_URL = trimTrailingSlashes(
  String(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL,
);

export const LEGAL_LAST_UPDATED =
  String(process.env.NEXT_PUBLIC_LEGAL_LAST_UPDATED || DEFAULT_LAST_UPDATED).trim() ||
  DEFAULT_LAST_UPDATED;

export const LEGAL_COMPANY = {
  legalName:
    String(process.env.NEXT_PUBLIC_LEGAL_COMPANY || 'Kloel Tecnologia LTDA').trim() ||
    'Kloel Tecnologia LTDA',
  tradeName: 'Kloel Tecnologia',
  cnpj: '66.303.607/0001-59',
  addressLine1: 'Alameda Carajás, s/n, Quadra 5, Lote 11',
  addressLine2: 'Residencial Aldeia das Thermas',
  city: 'Caldas Novas',
  state: 'GO',
  postalCode: '75694-720',
  country: 'Brasil',
  dpoEmail: 'privacy@kloel.com',
  supportEmail: 'ajuda@kloel.com',
  controllerEmail: 'ajuda@kloel.com',
  anpdUrl: 'https://www.gov.br/anpd/pt-br',
} as const;

export function buildLegalUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${LEGAL_SITE_URL}${normalizedPath}`;
}

export function formatLegalDate(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(`${LEGAL_LAST_UPDATED}T00:00:00-03:00`));
}

type BuildMetadataInput = {
  title: string;
  description: string;
  path: string;
  locale: 'pt_BR' | 'en_US';
  alternateLanguagePath?: string;
  alternateLanguageCode?: 'pt-BR' | 'en-US';
};

export function buildLegalMetadata(input: BuildMetadataInput): Metadata {
  const canonical = buildLegalUrl(input.path);

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages:
        input.alternateLanguagePath && input.alternateLanguageCode
          ? {
              [input.alternateLanguageCode]: buildLegalUrl(input.alternateLanguagePath),
            }
          : undefined,
    },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      siteName: 'Kloel',
      type: 'article',
      locale: input.locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
    },
  };
}
