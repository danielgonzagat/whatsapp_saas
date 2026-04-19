export type AlertTone = 'success' | 'warning' | 'error' | 'info';

export interface SystemAlert {
  id: string;
  type: AlertTone;
  message: string;
  detail?: string;
}

export interface SystemHealthDependency {
  status?: string;
  error?: string;
  missing?: string[];
  connectedWorkspaces?: number;
  driver?: string;
  [key: string]: unknown;
}

export interface SystemHealthSnapshot {
  status?: string;
  details?: {
    database?: SystemHealthDependency;
    redis?: SystemHealthDependency;
    whatsapp?: SystemHealthDependency;
    worker?: SystemHealthDependency;
    storage?: SystemHealthDependency;
    config?: SystemHealthDependency;
    openai?: SystemHealthDependency;
    anthropic?: SystemHealthDependency;
    stripe?: SystemHealthDependency;
    googleAuth?: SystemHealthDependency;
    version?: string;
    timestamp?: string;
    [key: string]: unknown;
  };
}

export interface SystemHealthPill {
  id: string;
  label: string;
  tone: AlertTone;
  value: string;
}

function readStatus(node?: SystemHealthDependency | null): string {
  return String(node?.status || '').trim().toUpperCase();
}

function statusToTone(status: string): AlertTone {
  switch (status) {
    case 'UP':
    case 'CONFIGURED':
      return 'success';
    case 'DEGRADED':
      return 'warning';
    case 'DOWN':
      return 'error';
    case 'MISSING':
    case 'NOT_CONFIGURED':
      return 'warning';
    default:
      return 'info';
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case 'UP':
      return 'Operando';
    case 'CONFIGURED':
      return 'Configurado';
    case 'DEGRADED':
      return 'Degradado';
    case 'DOWN':
      return 'Indisponível';
    case 'MISSING':
      return 'Ausente';
    case 'NOT_CONFIGURED':
      return 'Não configurado';
    default:
      return 'Sem leitura';
  }
}

function joinMissing(missing?: string[]): string {
  return Array.isArray(missing) && missing.length > 0 ? missing.join(', ') : '';
}

export function summarizeSystemHealth(snapshot?: SystemHealthSnapshot | null): SystemHealthPill[] {
  const details = snapshot?.details;
  if (!details) return [];

  return [
    { id: 'db', label: 'Banco', tone: statusToTone(readStatus(details.database)), value: formatStatus(readStatus(details.database)) },
    { id: 'redis', label: 'Redis', tone: statusToTone(readStatus(details.redis)), value: formatStatus(readStatus(details.redis)) },
    { id: 'meta', label: 'Meta', tone: statusToTone(readStatus(details.whatsapp)), value: formatStatus(readStatus(details.whatsapp)) },
    { id: 'worker', label: 'Worker', tone: statusToTone(readStatus(details.worker)), value: formatStatus(readStatus(details.worker)) },
    {
      id: 'storage',
      label: 'Storage',
      tone: statusToTone(readStatus(details.storage)),
      value:
        readStatus(details.storage) === 'UP'
          ? String(details.storage?.driver || 'Operando')
          : formatStatus(readStatus(details.storage)),
    },
    { id: 'config', label: 'Config', tone: statusToTone(readStatus(details.config)), value: formatStatus(readStatus(details.config)) },
  ];
}

export function deriveSystemAlerts(snapshot?: SystemHealthSnapshot | null): SystemAlert[] {
  const details = snapshot?.details;
  if (!details) {
    return [];
  }

  const alerts: SystemAlert[] = [];
  const databaseStatus = readStatus(details.database);
  const redisStatus = readStatus(details.redis);
  const whatsappStatus = readStatus(details.whatsapp);
  const workerStatus = readStatus(details.worker);
  const storageStatus = readStatus(details.storage);
  const configStatus = readStatus(details.config);
  const openAiStatus = readStatus(details.openai);
  const anthropicStatus = readStatus(details.anthropic);
  const stripeStatus = readStatus(details.stripe);
  const googleStatus = readStatus(details.googleAuth);

  if (databaseStatus === 'DOWN') {
    alerts.push({
      id: 'database-down',
      type: 'error',
      message: 'Banco indisponível',
      detail: `O backend não conseguiu consultar o banco. Último erro: ${String(details.database?.error || 'sem detalhe')}.`,
    });
  }

  if (redisStatus === 'DOWN') {
    alerts.push({
      id: 'redis-down',
      type: 'error',
      message: 'Redis indisponível',
      detail: `Filas, cache e coordenação em tempo real podem falhar. Último erro: ${String(details.redis?.error || 'sem detalhe')}.`,
    });
  }

  if (configStatus === 'DOWN') {
    const missing = joinMissing(details.config?.missing);
    alerts.push({
      id: 'config-down',
      type: 'error',
      message: 'Configuração crítica incompleta',
      detail: missing
        ? `Variáveis ausentes: ${missing}. Sem elas a operação entra em estado parcial ou falho.`
        : 'Há segredos ou chaves críticas ausentes no backend.',
    });
  }

  if (whatsappStatus === 'DOWN' || whatsappStatus === 'DEGRADED') {
    const connectedWorkspaces = Number(details.whatsapp?.connectedWorkspaces || 0);
    const missingMetaParts = [
      details.whatsapp?.appId === 'MISSING' ? 'META_APP_ID' : null,
      details.whatsapp?.appSecret === 'MISSING' ? 'META_APP_SECRET' : null,
      details.whatsapp?.webhook === 'MISSING' ? 'META webhook' : null,
    ].filter(Boolean);
    alerts.push({
      id: 'meta-whatsapp',
      type: connectedWorkspaces > 0 ? 'warning' : 'info',
      message: 'Canal Meta precisa de intervenção',
      detail: [
        connectedWorkspaces > 0
          ? `${connectedWorkspaces} workspace(s) já dependem do canal Meta.`
          : 'O canal Meta ainda não está pronto para onboarding real.',
        missingMetaParts.length > 0 ? `Pendências: ${missingMetaParts.join(', ')}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  if (workerStatus === 'DOWN' || workerStatus === 'DEGRADED') {
    alerts.push({
      id: 'worker-health',
      type: workerStatus === 'DOWN' ? 'error' : 'warning',
      message: workerStatus === 'DOWN' ? 'Worker indisponível' : 'Worker degradado',
      detail: String(details.worker?.error || 'O runtime assíncrono não respondeu como esperado.'),
    });
  }

  if (storageStatus === 'DOWN') {
    alerts.push({
      id: 'storage-down',
      type: 'error',
      message: 'Storage indisponível',
      detail: `Uploads e artefatos podem falhar. Último erro: ${String(details.storage?.error || 'sem detalhe')}.`,
    });
  }

  if (openAiStatus !== 'CONFIGURED' && anthropicStatus !== 'CONFIGURED') {
    alerts.push({
      id: 'ai-providers-missing',
      type: 'warning',
      message: 'Provedores de IA não configurados',
      detail: 'OpenAI e Anthropic aparecem indisponíveis. A CIA não conseguirá operar respostas automáticas com estabilidade.',
    });
  }

  if (stripeStatus === 'MISSING' || stripeStatus === 'NOT_CONFIGURED') {
    alerts.push({
      id: 'stripe-missing',
      type: 'warning',
      message: 'Stripe não configurado',
      detail: 'Wallets e fluxos internacionais ficam bloqueados até a chave secreta do Stripe existir no backend.',
    });
  }

  if (googleStatus === 'MISSING' || googleStatus === 'DOWN' || googleStatus === 'NOT_CONFIGURED') {
    alerts.push({
      id: 'google-auth-missing',
      type: 'info',
      message: 'Google OAuth exige revisão final',
      detail: 'O backend não encontrou a configuração completa do Google Auth. Revise client IDs, client secret e o rollout de verificação antes da submissão.',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-green',
      type: 'success',
      message: 'Todos os serviços críticos estão operacionais.',
      detail: 'Banco, Redis, transporte Meta, worker e configuração crítica responderam dentro do esperado nesta leitura.',
    });
  }

  return alerts;
}
