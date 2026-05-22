import { KLOEL_THEME } from '@/lib/kloel-theme';

interface Props {
  isLoading: boolean;
  loadError: string | null;
  setupUnavailable: boolean;
  isConnected: boolean | undefined;
}

export function StatusDisplay({ isLoading, loadError, setupUnavailable, isConnected }: Props) {
  if (isLoading) {
    return <p style={{ color: KLOEL_THEME.textSecondary }}>Carregando status oficial...</p>;
  }
  if (loadError) {
    return <p style={{ color: KLOEL_THEME.error }}>Falha ao carregar conexão: {loadError}</p>;
  }
  if (setupUnavailable) {
    return (
      <p style={{ color: KLOEL_THEME.textSecondary }}>
        Configuração server-side pendente para este canal.
      </p>
    );
  }
  if (!isConnected) {
    return (
      <p style={{ color: KLOEL_THEME.textSecondary }}>
        Nenhuma conta conectada neste workspace.
      </p>
    );
  }
  return null;
}
