import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
// ───────────────────────── v4: product-oriented operating layer ───────────
// These tools do not replace product engineering. They make the principle
// executable for every CLI that loads this MCP: convert a human goal into a
// product contract, demand behavior proof, classify facade risk, keep a
// continuity snapshot, and coordinate fronts through POSIX mkdir locks.
export const PRODUCT_INTEGRATION_IDS = [
  'chat_persistence',
  'stripe_webhooks',
  'meta_whatsapp',
  'war_room_campaigns',
  'generic_product_flow',
] as const;

export type ProductIntegrationId = (typeof PRODUCT_INTEGRATION_IDS)[number];

export type ProductIntegrationProfile = {
  id: ProductIntegrationId;
  label: string;
  keywords: string[];
  surfaces: string[];
  acceptanceCriteria: string[];
  behaviorProof: string[];
  externalBlockers: string[];
};

const PRODUCT_INTEGRATIONS: Record<ProductIntegrationId, ProductIntegrationProfile> = {
  chat_persistence: {
    id: 'chat_persistence',
    label: 'Chat persistido em Postgres',
    keywords: ['chat', 'message', 'mensagem', 'session', 'sessao', 'postgres', 'historico'],
    surfaces: [
      'backend service/controller',
      'Prisma/Postgres',
      'frontend-admin chat UI',
      'chat tests',
    ],
    acceptanceCriteria: [
      'criar uma sessao de chat',
      'adicionar pelo menos uma mensagem',
      'recarregar a sessao',
      'observar a mesma mensagem persistida',
      'provar isolamento por workspace/admin quando aplicavel',
    ],
    behaviorProof: [
      'API response',
      'DB row/relation',
      'focused backend test',
      'optional browser/admin flow',
    ],
    externalBlockers: [],
  },
  stripe_webhooks: {
    id: 'stripe_webhooks',
    label: 'Stripe webhooks consumidos',
    keywords: ['stripe', 'webhook', 'payment', 'pix', 'checkout', 'wallet', 'payout'],
    surfaces: [
      'webhook endpoint',
      'signature verification',
      'idempotency',
      'ledger/wallet effects',
    ],
    acceptanceCriteria: [
      'replay de evento Stripe assinado ou fixture oficial',
      'assinatura recusada quando invalida',
      'evento duplicado nao gera efeito duplicado',
      'efeito financeiro esperado aparece no ledger/wallet',
    ],
    behaviorProof: ['webhook replay', 'signature assertion', 'DB side effect', 'idempotency test'],
    externalBlockers: ['Stripe live credentials or test-mode fixture availability'],
  },
  meta_whatsapp: {
    id: 'meta_whatsapp',
    label: 'Meta Cloud API / WhatsApp oficial',
    keywords: ['meta', 'whatsapp', 'cloud api', 'phone_number_id', 'template', 'app review'],
    surfaces: [
      'Meta OAuth/config',
      'webhook verify/callback',
      'message send path',
      'App Review evidence',
    ],
    acceptanceCriteria: [
      'callback URL responde ao desafio de verificacao',
      'webhook inbound e validado e roteado',
      'envio oficial usa phone_number_id real',
      'bloqueio externo de App Review e separado de falha de codigo',
    ],
    behaviorProof: ['Meta callback probe', 'webhook fixture', 'provider log/API response'],
    externalBlockers: [
      'Meta App Review and business verification may require human/provider action',
    ],
  },
  war_room_campaigns: {
    id: 'war_room_campaigns',
    label: 'War Room para campanhas reais',
    keywords: ['war room', 'campaign', 'campanha', 'ads', 'audience', 'creative'],
    surfaces: [
      'campaign draft API',
      'audience/product binding',
      'activation safety',
      'metrics/event spine',
    ],
    acceptanceCriteria: [
      'criar draft de campanha com produto e audiencia',
      'validar guardrails antes de ativacao',
      'emitir evento/metricas de campanha',
      'mostrar a campanha na UI operacional',
    ],
    behaviorProof: ['API response', 'event emitted/consumed', 'UI visibility', 'metrics row/log'],
    externalBlockers: ['Ad-network account permissions may block real activation'],
  },
  generic_product_flow: {
    id: 'generic_product_flow',
    label: 'Fluxo de produto generico',
    keywords: [],
    surfaces: ['changed code surface', 'tests', 'runtime/API/browser proof'],
    acceptanceCriteria: [
      'definir comportamento observavel',
      'executar a menor prova suficiente',
      'registrar o que segue nao provado',
    ],
    behaviorProof: ['focused test', 'runtime/API/browser proof when available'],
    externalBlockers: [],
  },
};

export const EvidenceKindSchema = z.enum([
  'code',
  'unit_test',
  'typecheck',
  'build',
  'api',
  'db',
  'browser',
  'runtime_probe',
  'external_provider',
  'manual_product_check',
  'mock',
  'stub',
]);
export const EvidenceStatusSchema = z.enum(['passed', 'failed', 'missing', 'blocked', 'not_run']);

export function lowerText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function chooseIntegration(
  goal: string,
  explicit?: ProductIntegrationId,
): ProductIntegrationProfile {
  if (explicit) return PRODUCT_INTEGRATIONS[explicit];
  const normalized = lowerText(goal);
  const candidates = PRODUCT_INTEGRATION_IDS.filter((id) => id !== 'generic_product_flow')
    .map((id) => {
      const profile = PRODUCT_INTEGRATIONS[id];
      const score = profile.keywords.filter((keyword) =>
        normalized.includes(lowerText(keyword)),
      ).length;
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score ? candidates[0].profile : PRODUCT_INTEGRATIONS.generic_product_flow;
}

export function riskLevelFor(
  goal: string,
  profile: ProductIntegrationProfile,
): 'low' | 'normal' | 'high' | 'critical' {
  const normalized = lowerText(`${goal} ${profile.label}`);
  if (/payment|stripe|pix|payout|ledger|wallet|kyc|dinheiro/.test(normalized)) return 'critical';
  if (/auth|token|admin|whatsapp|webhook|meta|external|provider/.test(normalized)) return 'high';
  if (/database|postgres|prisma|campaign|campanha|api/.test(normalized)) return 'normal';
  return 'low';
}

export function validationPlan(profile: ProductIntegrationProfile, risk: string): string[] {
  const plan = [
    'ler estrutura antes de editar: code_outline -> code_read_symbol',
    'executar a menor mutacao fiel via operador atomico/semantico',
    'rodar teste focado que prova o contrato alterado',
    ...profile.behaviorProof.map((proof) => `anexar evidencia: ${proof}`),
  ];
  if (risk === 'critical' || risk === 'high') {
    plan.push('rodar typecheck/build do pacote afetado');
    plan.push('registrar bloqueios externos separadamente de falhas de codigo');
  }
  return [...new Set(plan)];
}

export function evidenceWeight(
  kind: z.infer<typeof EvidenceKindSchema>,
  status: z.infer<typeof EvidenceStatusSchema>,
): number {
  if (status === 'failed') return -40;
  if (status === 'blocked') return 10;
  if (status !== 'passed') return 0;
  if (kind === 'manual_product_check') return 100;
  if (kind === 'browser' || kind === 'api' || kind === 'db' || kind === 'runtime_probe') return 85;
  if (kind === 'external_provider') return 80;
  if (kind === 'build' || kind === 'typecheck' || kind === 'unit_test') return 60;
  if (kind === 'code') return 50;
  if (kind === 'mock' || kind === 'stub') return 25;
  return 0;
}

export function classifyTruth(kind: string, status: string, hasExternalBlocker: boolean): string {
  if (hasExternalBlocker || status === 'blocked') return 'EXTERNAL_BLOCKED';
  if (kind === 'stub') return 'STUB';
  if (kind === 'mock') return status === 'passed' ? 'MOCK_ONLY' : 'UNPROVEN';
  if (status === 'failed') return 'BROKEN';
  if (status !== 'passed') return 'UNPROVEN';
  if (
    ['api', 'db', 'browser', 'runtime_probe', 'external_provider', 'manual_product_check'].includes(
      kind,
    )
  ) {
    return 'REAL';
  }
  if (['unit_test', 'typecheck', 'build'].includes(kind)) return 'PARTIAL';
  return 'UNPROVEN';
}

export function readJsonOptional<T>(relPath: string): T | null {
  try {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readTextOptional(relPath: string): string | null {
  try {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

export function lockRoot(): string {
  return path.join(REPO_ROOT, '.atomic-edit-locks');
}

export function safeLockId(frontId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(frontId)) {
    throw new Error('frontId must use only letters, numbers, dot, underscore, or dash');
  }
  return frontId;
}

export function lockDir(frontId: string): string {
  return path.join(lockRoot(), safeLockId(frontId));
}

export function lockFile(frontId: string): string {
  return path.join(lockDir(frontId), 'lock');
}

export function autoLockFile(relPath: string): string | null {
  const sanitized = relPath.replace(/[\\/:*?"<>|]/g, '-');
  const lockId = safeLockId(sanitized + '-' + Date.now());
  const d = lockDir(lockId);
  try {
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'heartbeat'), String(Date.now()));
    return lockId;
  } catch {
    return null;
  }
}

export function autoLockCleanup(relPath: string, maxAgeMs = 30000): void {
  const root = lockRoot();
  if (!fs.existsSync(root)) return;
  const now = Date.now();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const hbPath = path.join(root, entry.name, 'heartbeat');
    try {
      const ts = Number(fs.readFileSync(hbPath, 'utf8'));
      if (now - ts > maxAgeMs) {
        fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
    }
  }
}

export function readLockRecord(id: string): Record<string, unknown> | null {
  const relPath = `.atomic-edit-locks/${id}/lock`;
  const json = readJsonOptional<Record<string, unknown>>(relPath);
  if (json) return json;
  const text = readTextOptional(relPath);
  if (!text) return null;
  const record: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    record[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return Object.keys(record).length > 0 ? record : null;
}

export function listLocks(): Record<string, unknown>[] {
  const root = lockRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const id = entry.name;
      const data = readLockRecord(id);
      return data ? { frontId: id, ...data } : { frontId: id, status: 'unreadable' };
    });
}

