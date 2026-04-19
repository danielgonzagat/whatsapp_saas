import { colors, radius } from '@/lib/design-tokens';
import {
  deletionStatusCopy,
  formatDeletionProviderLabel,
  type DeletionStatusPayload,
} from '@/lib/data-deletion-status';
import { buildLegalMetadata } from '@/lib/legal-constants';
import { getBackendCandidateUrls } from '@/app/api/_lib/backend-url';

async function fetchDeletionStatus(code: string): Promise<DeletionStatusPayload | null> {
  for (const baseUrl of getBackendCandidateUrls()) {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/g, '')}/compliance/deletion-status/${encodeURIComponent(code)}`,
        {
          cache: 'no-store',
        },
      );

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        continue;
      }

      return (await response.json()) as DeletionStatusPayload;
    } catch {
      continue;
    }
  }

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return buildLegalMetadata({
    title: `Status de exclusão | ${code} | Kloel`,
    description: 'Acompanhe o andamento de uma solicitação de exclusão de dados registrada na Kloel.',
    path: `/data-deletion/status/${code}`,
    locale: 'pt_BR',
  });
}

export default async function DataDeletionStatusPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const status = await fetchDeletionStatus(code);
  const copy = status ? deletionStatusCopy[status.status] || deletionStatusCopy.pending : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: colors.background.void,
        color: colors.text.silver,
        padding: '48px 20px 72px',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          display: 'grid',
          gap: '18px',
        }}
      >
        <div
          style={{
            border: `1px solid ${colors.border.space}`,
            background: colors.background.surface,
            borderRadius: radius.lg,
            padding: '28px',
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              fontSize: '12px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.text.dim,
            }}
          >
            Status da exclusão
          </p>
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: '32px',
              lineHeight: '1.15',
              fontWeight: 500,
            }}
          >
            {copy ? copy.label : 'Código não encontrado'}
          </h1>
          <p
            style={{
              margin: '0 0 18px',
              fontSize: '16px',
              lineHeight: 1.7,
              color: colors.text.muted,
            }}
          >
            {copy
              ? copy.detail
              : 'Não localizamos uma solicitação com esse código. Confirme o identificador informado pelo provedor.'}
          </p>
          <div
            style={{
              display: 'grid',
              gap: '10px',
              fontSize: '15px',
              lineHeight: 1.65,
              color: colors.text.muted,
            }}
          >
            <div>
              <strong style={{ color: colors.text.silver }}>Código:</strong> {code}
            </div>
            {status ? (
              <>
                <div>
                  <strong style={{ color: colors.text.silver }}>Origem:</strong>{' '}
                  {formatDeletionProviderLabel(status.provider)}
                </div>
                <div>
                  <strong style={{ color: colors.text.silver }}>Solicitado em:</strong>{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(status.requestedAt))}
                </div>
                <div>
                  <strong style={{ color: colors.text.silver }}>Prazo estimado:</strong> até 30 dias
                  corridos após validação.
                </div>
                {status.completedAt ? (
                  <div>
                    <strong style={{ color: colors.text.silver }}>Concluído em:</strong>{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                      timeZone: 'America/Sao_Paulo',
                    }).format(new Date(status.completedAt))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
