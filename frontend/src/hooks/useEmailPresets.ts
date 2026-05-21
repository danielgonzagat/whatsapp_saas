'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

export interface EmailTemplatePreset {
  id: string;
  label: string;
  subject: string;
  html: string;
}

const FALLBACK_PRESETS: EmailTemplatePreset[] = [
  {
    id: 'boas-vindas',
    label: 'Boas-vindas',
    subject: 'Bem-vindo ao Kloel',
    html: '<h1>Bem-vindo</h1><p>Seu acesso foi liberado e sua jornada começa agora.</p>',
  },
  {
    id: 'recuperacao',
    label: 'Recuperação',
    subject: 'Seu checkout ainda está te esperando',
    html: '<h1>Seu pedido ficou salvo</h1><p>Retome a compra com um clique e finalize em poucos segundos.</p>',
  },
  {
    id: 'oferta',
    label: 'Oferta relâmpago',
    subject: 'Oferta por tempo limitado',
    html: '<h1>Oferta ativa</h1><p>Condição especial liberada hoje para a sua base.</p>',
  },
];

export function useEmailPresets() {
  const { data, error, isLoading } = useSWR<EmailTemplatePreset[]>(
    '/marketing/email-templates/presets',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 300000,
    },
  );

  const presets = Array.isArray(data) && data.length > 0 ? data : FALLBACK_PRESETS;
  const apiError = error ? (error as Error).message : null;

  return { presets, isLoading, error: apiError };
}
