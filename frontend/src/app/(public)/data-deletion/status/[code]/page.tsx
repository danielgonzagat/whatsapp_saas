'use client';

import { colors } from '@/lib/design-tokens';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const sora = "var(--font-sora), 'Sora', sans-serif";
const mono = "var(--font-jetbrains), 'JetBrains Mono', monospace";

type DeletionStatusResponse = {
  provider?: string;
  status?: string;
  requestedAt?: string;
  completedAt?: string | null;
  message?: string;
};

export default function DataDeletionStatusPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || '').trim();
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    data: DeletionStatusResponse | null;
  }>({
    loading: true,
    error: '',
    data: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!code) {
        setState({ loading: false, error: 'Código de confirmação inválido.', data: null });
        return;
      }

      try {
        const response = await fetch(
          `/api/compliance/deletion-status/${encodeURIComponent(code)}`,
          {
            cache: 'no-store',
          },
        );
        const data = (await response.json().catch(() => ({}))) as DeletionStatusResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setState({
            loading: false,
            error: data.message || 'Não foi possível consultar o status da solicitação.',
            data: null,
          });
          return;
        }

        setState({ loading: false, error: '', data });
      } catch {
        if (!cancelled) {
          setState({
            loading: false,
            error: 'Falha de rede ao consultar o status da solicitação.',
            data: null,
          });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        color: colors.text.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 720,
          background: colors.background.surface,
          border: `1px solid ${colors.background.border}`,
          borderRadius: 6,
          padding: '28px',
          display: 'grid',
          gap: 18,
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 12px',
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: colors.ember.primary,
            }}
          >
            Deletion Status
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: sora,
              fontSize: 32,
              lineHeight: 1.15,
              fontWeight: 500,
            }}
          >
            Acompanhamento da solicitação
          </h1>
        </div>

        <div
          style={{
            padding: '18px',
            borderRadius: 6,
            border: `1px solid ${colors.background.border}`,
            background: colors.background.void,
            fontFamily: sora,
            fontSize: 16,
            lineHeight: 1.7,
            color: state.error ? colors.ember.primary : colors.text.secondary,
          }}
        >
          {state.loading
            ? 'Consultando status...'
            : state.error
              ? state.error
              : `Status atual: ${translateStatus(state.data?.status)}.`}
        </div>

        {state.data ? (
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <StatusCard label="Código" value={code} />
            <StatusCard label="Origem" value={translateProvider(state.data.provider)} />
            <StatusCard label="Solicitado em" value={formatDate(state.data.requestedAt)} />
            <StatusCard
              label="Concluído em"
              value={
                state.data.completedAt ? formatDate(state.data.completedAt) : 'Em processamento'
              }
            />
          </div>
        ) : null}

        <p
          style={{
            margin: 0,
            fontFamily: sora,
            fontSize: 14,
            lineHeight: 1.7,
            color: colors.text.secondary,
          }}
        >
          Prazo estimado para execução completa: até 30 dias após validação da solicitação, salvo
          retenções legais obrigatórias.
        </p>
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '16px',
        borderRadius: 6,
        background: colors.background.void,
        border: `1px solid ${colors.background.border}`,
      }}
    >
      <p
        style={{
          margin: '0 0 8px',
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: colors.text.secondary,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: sora,
          fontSize: 15,
          lineHeight: 1.7,
          color: colors.text.primary,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function translateStatus(status?: string) {
  switch (String(status || '').toLowerCase()) {
    case 'pending':
      return 'Pendente';
    case 'processing':
      return 'Em processamento';
    case 'completed':
      return 'Concluída';
    case 'failed':
      return 'Falhou';
    default:
      return 'Indefinido';
  }
}

function translateProvider(provider?: string) {
  switch (String(provider || '').toLowerCase()) {
    case 'facebook':
      return 'Facebook/Meta';
    case 'google':
      return 'Google';
    case 'self':
      return 'Autoatendimento';
    default:
      return provider || 'Desconhecido';
  }
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Não disponível';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Não disponível';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
