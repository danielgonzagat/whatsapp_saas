import type {
  Break,
  PulseBrowserFailureCode,
  PulseEnvironment,
  PulseFlowEvidence,
  PulseFlowResult,
  PulseHealth,
  PulseManifest,
  PulseManifestFlowSpec,
  PulseParserInventory,
} from '../types';
import { obtainAuthToken } from '../browser-stress-tester/auth';
import type { AuthCredentials } from '../browser-stress-tester/types';
import {
  getRuntimeResolution,
  httpGet,
  httpPost,
  httpPut,
} from '../parsers/runtime-utils';

interface RunDeclaredFlowsInput {
  environment: PulseEnvironment;
  manifest: PulseManifest | null;
  health: PulseHealth;
  parserInventory: PulseParserInventory;
  flowIds?: string[];
  enforceDiagnosticPreconditions?: boolean;
}

const FLOW_ARTIFACT = 'PULSE_FLOW_EVIDENCE.json';
const FLOW_DETAIL_PREFIX = 'PULSE_FLOW_';
const DEFAULT_REPLAY_TEST_PHONE = '5511999990000';

const FLOW_BREAK_PATTERNS: Record<string, RegExp[]> = {
  'auth-login': [
    /^AUTH_BYPASS_VULNERABLE$/,
    /^AUTH_FLOW_BROKEN$/,
    /^E2E_REGISTRATION_BROKEN$/,
  ],
  'product-create': [
    /^E2E_PRODUCT_BROKEN$/,
  ],
  'checkout-payment': [
    /^E2E_PAYMENT_BROKEN$/,
    /^ORDERING_WEBHOOK_OOO$/,
  ],
  'wallet-withdrawal': [
    /^E2E_RACE_CONDITION_WITHDRAWAL$/,
    /^RACE_CONDITION_FINANCIAL$/,
  ],
  'whatsapp-message-send': [],
};

function isBlockingBreak(item: Break): boolean {
  return item.severity === 'critical' || item.severity === 'high';
}

function getActiveFlowAcceptance(manifest: PulseManifest | null, flowId: string) {
  if (!manifest) return null;
  const now = Date.now();
  return manifest.temporaryAcceptances.find(entry => {
    if (entry.targetType !== 'flow' || entry.target !== flowId) return false;
    const expiresAt = Date.parse(entry.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt >= now;
  }) || null;
}

function getLoadedCheckNames(parserInventory: PulseParserInventory): Set<string> {
  return new Set(parserInventory.loadedChecks.map(check => check.name));
}

function getApplicableSpecs(environment: PulseEnvironment, manifest: PulseManifest | null): PulseManifestFlowSpec[] {
  if (!manifest) return [];
  return manifest.flowSpecs.filter(spec => spec.environments.includes(environment));
}

function collectMatchingBreaks(health: PulseHealth, patterns: RegExp[]): Break[] {
  return health.breaks.filter(item => isBlockingBreak(item) && patterns.some(pattern => pattern.test(item.type)));
}

interface FlowRuntimeContext {
  manifest: PulseManifest | null;
  runtimeResolution: ReturnType<typeof getRuntimeResolution>;
  authPromise: Promise<AuthCredentials> | null;
}

interface FlowExecutionOverrides {
  executed?: boolean;
  providerModeUsed?: PulseFlowResult['providerModeUsed'];
  smokeExecuted?: boolean;
  replayExecuted?: boolean;
  failureClass?: PulseFlowResult['failureClass'];
}

function getFlowDetailArtifact(flowId: string): string {
  return `${FLOW_DETAIL_PREFIX}${flowId.replace(/[^a-z0-9_-]+/gi, '-')}.json`;
}

function replayEnabled(spec: PulseManifestFlowSpec): boolean {
  return spec.providerMode === 'replay' || spec.providerMode === 'hybrid';
}

function smokeEnabled(spec: PulseManifestFlowSpec): boolean {
  if (!spec.smokeRequired) return false;
  return spec.providerMode === 'real_smoke' || spec.providerMode === 'hybrid';
}

function getArtifactPaths(flowId: string): string[] {
  return [FLOW_ARTIFACT, getFlowDetailArtifact(flowId)];
}

function getManifestAdapterValue<T>(manifest: PulseManifest | null, key: string): T | undefined {
  const config = manifest?.adapterConfig;
  if (!config || typeof config !== 'object') return undefined;
  return (config as Record<string, unknown>)[key] as T | undefined;
}

function isTruthyEnv(value: string | undefined | null): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function getConfiguredTestPhone(manifest: PulseManifest | null): string | null {
  const envPhone = process.env.PULSE_TEST_PHONE || process.env.E2E_TEST_PHONE;
  const manifestPhone = getManifestAdapterValue<string>(manifest, 'pulseTestPhone');
  const phone = String(envPhone || manifestPhone || '').trim();
  return phone || null;
}

function getReplayPhone(manifest: PulseManifest | null): string {
  const configured = normalizePhone(getConfiguredTestPhone(manifest));
  return configured || DEFAULT_REPLAY_TEST_PHONE;
}

function getConfiguredWithdrawalAmount(manifest: PulseManifest | null): number {
  const envAmount = process.env.PULSE_WALLET_WITHDRAWAL_AMOUNT;
  const manifestAmount = getManifestAdapterValue<number | string>(manifest, 'pulseWalletWithdrawalAmount');
  const parsed = Number(envAmount || manifestAmount || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/\D+/g, '');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compactSummary(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(item => compactSummary(item)).filter(Boolean).join('; ');
  }
  if (value && typeof value === 'object') {
    const maybeMessage = (value as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string') return maybeMessage.trim();
    const maybeError = (value as Record<string, unknown>).error;
    if (typeof maybeError === 'string') return maybeError.trim();
  }
  return '';
}

function isProvisioningGap(summary: string): boolean {
  const lowered = summary.toLowerCase();
  return [
    'runtime do whatsapp indisponível',
    'configuração do provedor incompleta',
    'contato sem opt-in',
    'fora da janela de 24h',
    'saldo insuficiente',
    'kyc',
    'forbidden',
    'unauthorized',
    'subscription',
    'worker indisponível',
    'worker unavailable',
    'provider',
    'phone not configured',
    'disabled for safety',
  ].some(token => lowered.includes(token));
}

function buildPulseSuffix(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function buildProductSlug(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function isTransportGap(status: number, summary: string): boolean {
  const lowered = summary.toLowerCase();
  return status === 0
    || lowered.includes('timed out')
    || lowered.includes('fetch failed')
    || lowered.includes('request failed')
    || lowered.includes('enotfound')
    || lowered.includes('econnrefused')
    || lowered.includes('econnreset')
    || lowered.includes('socket hang up')
    || lowered.includes('aborted');
}

function buildHttpBackedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  status: number,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  if (isTransportGap(status, summary) || isProvisioningGap(summary)) {
    return buildMissingEvidenceResult(spec, summary, metrics, {
      ...overrides,
      executed: overrides.executed ?? status > 0,
    });
  }

  return buildFailureResult(spec, summary, metrics, {
    ...overrides,
    executed: overrides.executed ?? status > 0,
  });
}

function getResponseSummary(status: number, body: unknown): string {
  return compactSummary(body) || `HTTP ${status}`;
}

function extractWorkspaceId(payload: any, fallback: string): string {
  const candidates = [
    payload?.id,
    payload?.workspaceId,
    payload?.workspace?.id,
    payload?.workspace?.workspaceId,
    fallback,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }

  return '';
}

async function ensureAuth(context: FlowRuntimeContext): Promise<AuthCredentials> {
  if (!context.authPromise) {
    context.authPromise = obtainAuthToken(context.runtimeResolution.backendUrl);
  }
  return context.authPromise;
}

function buildMissingEvidenceResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'missing_evidence',
    executed: overrides.executed ?? false,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? false,
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'missing_evidence',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

function buildFailureResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'failed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'product_failure',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

function buildPassedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'passed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

async function fetchJsonWithAuth(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  jwt: string,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    return httpGet(path, { jwt, timeout: 15000 });
  }
  if (method === 'PUT') {
    return httpPut(path, body, { jwt, timeout: 15000 });
  }
  return httpPost(path, body, { jwt, timeout: 15000 });
}

function inferWhatsappFailureCode(summary: string): PulseBrowserFailureCode {
  const lowered = summary.toLowerCase();
  if (lowered.includes('unauthorized') || lowered.includes('auth')) {
    return 'backend_auth_unreachable';
  }
  return 'backend_auth_unreachable';
}

async function runWalletWithdrawalFlow(
  spec: PulseManifestFlowSpec,
  context: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  try {
    const auth = await ensureAuth(context);
    const amount = getConfiguredWithdrawalAmount(context.manifest);
    const replayMode = !isTruthyEnv(process.env.PULSE_ALLOW_REAL_WITHDRAWAL);
    const replayMarker = `pulse-wallet-${Date.now().toString(36)}`;
    const replayPhone = getReplayPhone(context.manifest);

    if (replayMode) {
      const profileRes = await fetchJsonWithAuth('PUT', '/kyc/profile', auth.token, {
        name: 'PULSE Replay Operator',
        publicName: 'PULSE Replay',
        phone: replayPhone,
        birthDate: '1990-01-01',
      });

      if (!profileRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not update KYC profile: ${compactSummary(profileRes.body) || `HTTP ${profileRes.status}`}.`,
          { httpStatus: profileRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const fiscalRes = await fetchJsonWithAuth('PUT', '/kyc/fiscal', auth.token, {
        type: 'PF',
        cpf: '12345678909',
        fullName: 'Pulse Replay Wallet',
        cep: '01310930',
        city: 'Sao Paulo',
        state: 'SP',
        street: 'Avenida Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
      });

      if (!fiscalRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not update KYC fiscal data: ${compactSummary(fiscalRes.body) || `HTTP ${fiscalRes.status}`}.`,
          { httpStatus: fiscalRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const bankRes = await fetchJsonWithAuth('PUT', '/kyc/bank', auth.token, {
        bankName: 'PULSE Replay Bank',
        bankCode: '260',
        agency: '0001',
        account: String(Date.now()).slice(-6),
        accountType: 'CHECKING',
        pixKey: `${replayMarker}@pulse.kloel`,
        pixKeyType: 'EMAIL',
        holderName: 'Pulse Replay Wallet',
        holderDocument: '12345678909',
        isDefault: true,
      });

      if (!bankRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not provision banking data: ${compactSummary(bankRes.body) || `HTTP ${bankRes.status}`}.`,
          { httpStatus: bankRes.status },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      const autoCheckRes = await fetchJsonWithAuth('POST', '/kyc/auto-check', auth.token, {});
      const statusRes = await fetchJsonWithAuth('GET', '/kyc/status', auth.token);
      const completionRes = await fetchJsonWithAuth('GET', '/kyc/completion', auth.token);
      const completion = Number(completionRes.body?.percentage);
      const kycStatus = String(statusRes.body?.kycStatus || '');
      const approved = autoCheckRes.body?.approved === true || kycStatus === 'approved';

      if (!approved) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not approve KYC automatically. Current status: ${kycStatus || 'unknown'} (${Number.isFinite(completion) ? completion : 'n/a'}%).`,
          {
            kycStatus: kycStatus || 'unknown',
            kycCompletion: Number.isFinite(completion) ? completion : -1,
          },
          { smokeExecuted: false, replayExecuted: true },
        );
      }
    }

    const balanceRes = await fetchJsonWithAuth('GET', `/kloel/wallet/${auth.workspaceId}/balance`, auth.token);

    if (!balanceRes.ok) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal could not read balance: ${compactSummary(balanceRes.body) || `HTTP ${balanceRes.status}`}.`,
        { httpStatus: balanceRes.status },
      );
    }

    let availableBefore = Number(balanceRes.body?.available);
    let seededReplayCredit = false;
    let replayCreditTransactionId = '';

    if (replayMode && (!Number.isFinite(availableBefore) || availableBefore < amount)) {
      const saleAmount = round2(Math.max(amount + 5, amount * 1.5));
      const processSaleRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/process-sale`,
        auth.token,
        {
          amount: saleAmount,
          saleId: replayMarker,
          description: `PULSE replay credit ${replayMarker}`,
        },
      );

      if (!processSaleRes.ok || !processSaleRes.body?.transactionId) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not seed wallet balance: ${compactSummary(processSaleRes.body) || `HTTP ${processSaleRes.status}`}.`,
          { httpStatus: processSaleRes.status, requestedAmount: amount },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      replayCreditTransactionId = String(processSaleRes.body.transactionId);
      const confirmRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/confirm/${replayCreditTransactionId}`,
        auth.token,
        {},
      );

      if (!confirmRes.ok || confirmRes.body?.status !== 'confirmed') {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay could not confirm seeded wallet credit: ${compactSummary(confirmRes.body) || `HTTP ${confirmRes.status}`}.`,
          { httpStatus: confirmRes.status, transactionId: replayCreditTransactionId },
          { smokeExecuted: false, replayExecuted: true },
        );
      }

      seededReplayCredit = true;
      const replayBalanceRes = await fetchJsonWithAuth('GET', `/kloel/wallet/${auth.workspaceId}/balance`, auth.token);
      if (!replayBalanceRes.ok) {
        return buildFailureResult(
          spec,
          `wallet-withdrawal replay seeded balance but could not read it back: ${compactSummary(replayBalanceRes.body) || `HTTP ${replayBalanceRes.status}`}.`,
          { httpStatus: replayBalanceRes.status, transactionId: replayCreditTransactionId },
          { smokeExecuted: false, replayExecuted: true },
        );
      }
      availableBefore = Number(replayBalanceRes.body?.available);
    }

    if (!Number.isFinite(availableBefore) || availableBefore < amount) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal requires available balance >= ${amount}. Current available balance: ${Number.isFinite(availableBefore) ? availableBefore : 'unavailable'}.`,
        {
          availableBefore: Number.isFinite(availableBefore) ? availableBefore : -1,
          requestedAmount: amount,
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    const accountsRes = await fetchJsonWithAuth('GET', `/kloel/wallet/${auth.workspaceId}/bank-accounts`, auth.token);
    if (!accountsRes.ok) {
      return buildMissingEvidenceResult(
        spec,
        `wallet-withdrawal could not read bank accounts: ${compactSummary(accountsRes.body) || `HTTP ${accountsRes.status}`}.`,
        { httpStatus: accountsRes.status },
      );
    }

    const bankAccounts = Array.isArray(accountsRes.body?.accounts) ? accountsRes.body.accounts as Array<Record<string, unknown>> : [];
    let createdBankAccount = false;

    if (bankAccounts.length === 0) {
      const addAccountRes = await fetchJsonWithAuth(
        'POST',
        `/kloel/wallet/${auth.workspaceId}/bank-accounts`,
        auth.token,
        {
          bankName: 'PULSE Test Bank',
          pixKey: process.env.PULSE_TEST_PIX_KEY || `pulse+wallet-${Date.now()}@kloel.local`,
          bankCode: '260',
          agency: '0001',
          account: String(Date.now()).slice(-6),
          accountType: 'checking',
          isDefault: true,
        },
      );

      if (!addAccountRes.ok || addAccountRes.body?.success === false) {
        const summary = compactSummary(addAccountRes.body) || `HTTP ${addAccountRes.status}`;
        return isProvisioningGap(summary)
          ? buildMissingEvidenceResult(spec, `wallet-withdrawal could not provision a bank account: ${summary}.`, { httpStatus: addAccountRes.status }, { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) })
          : buildFailureResult(spec, `wallet-withdrawal failed while provisioning a bank account: ${summary}.`, { httpStatus: addAccountRes.status }, { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) });
      }

      createdBankAccount = true;
    }

    const beforeTransactionsRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/transactions?page=1&type=withdrawal`,
      auth.token,
    );
    const beforeTransactions = Array.isArray(beforeTransactionsRes.body?.transactions)
      ? beforeTransactionsRes.body.transactions as Array<Record<string, unknown>>
      : [];

    const withdrawRes = await fetchJsonWithAuth(
      'POST',
      `/kloel/wallet/${auth.workspaceId}/withdraw`,
      auth.token,
      { amount },
    );

    if (!withdrawRes.ok || withdrawRes.body?.success === false) {
      const summary = compactSummary(withdrawRes.body) || `HTTP ${withdrawRes.status}`;
      return isProvisioningGap(summary)
        ? buildMissingEvidenceResult(spec, `wallet-withdrawal could not execute in the current workspace: ${summary}.`, {
            httpStatus: withdrawRes.status,
            requestedAmount: amount,
          }, { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) })
        : buildFailureResult(spec, `wallet-withdrawal request failed: ${summary}.`, {
            httpStatus: withdrawRes.status,
            requestedAmount: amount,
          }, { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) });
    }

    const transactionId = String(withdrawRes.body?.transactionId || '').trim();
    const afterBalanceRes = await fetchJsonWithAuth('GET', `/kloel/wallet/${auth.workspaceId}/balance`, auth.token);
    const afterTransactionsRes = await fetchJsonWithAuth(
      'GET',
      `/kloel/wallet/${auth.workspaceId}/transactions?page=1&type=withdrawal`,
      auth.token,
    );

    if (!afterBalanceRes.ok || !afterTransactionsRes.ok) {
      return buildFailureResult(
        spec,
        `wallet-withdrawal executed but the readback oracle failed: balance HTTP ${afterBalanceRes.status}, transactions HTTP ${afterTransactionsRes.status}.`,
        {
          transactionId: transactionId || 'unknown',
          balanceStatus: afterBalanceRes.status,
          transactionsStatus: afterTransactionsRes.status,
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    const availableAfter = Number(afterBalanceRes.body?.available);
    const availableDelta = round2(availableAfter - availableBefore);
    const afterTransactions = Array.isArray(afterTransactionsRes.body?.transactions)
      ? afterTransactionsRes.body.transactions as Array<Record<string, unknown>>
      : [];
    const matchedTransaction = afterTransactions.find(item => String(item.id || '') === transactionId);
    const duplicateCount = afterTransactions.filter(item => String(item.id || '') === transactionId).length;
    const deltaMatches = Number.isFinite(availableAfter) && Math.abs(availableDelta + amount) <= 0.02;

    if (!transactionId || !matchedTransaction || duplicateCount !== 1 || !deltaMatches) {
      return buildFailureResult(
        spec,
        'wallet-withdrawal did not converge in the ledger oracle after the mutation.',
        {
          transactionFound: Boolean(matchedTransaction),
          duplicateCount,
          availableBefore: round2(availableBefore),
          availableAfter: Number.isFinite(availableAfter) ? round2(availableAfter) : -1,
          availableDelta,
          requestedAmount: amount,
          transactionId: transactionId || 'missing',
          transactionsBefore: beforeTransactions.length,
          transactionsAfter: afterTransactions.length,
          bankAccountCreated: createdBankAccount,
          seededReplayCredit,
          replayCreditTransactionId: replayCreditTransactionId || 'none',
        },
        { smokeExecuted: false, replayExecuted: replayMode || replayEnabled(spec) },
      );
    }

    return buildPassedResult(
      spec,
      replayMode
        ? `wallet-withdrawal replay passed with transaction ${transactionId} and ledger delta ${availableDelta}. Real withdrawal smoke remains opt-in.`
        : `wallet-withdrawal passed with transaction ${transactionId} and ledger delta ${availableDelta}.`,
      {
        transactionId,
        requestedAmount: amount,
        availableBefore: round2(availableBefore),
        availableAfter: round2(availableAfter),
        availableDelta,
        transactionsBefore: beforeTransactions.length,
        transactionsAfter: afterTransactions.length,
        bankAccountCreated: createdBankAccount,
        seededReplayCredit,
        replayCreditTransactionId: replayCreditTransactionId || 'none',
        smokePending: replayMode && spec.smokeRequired,
      },
      { smokeExecuted: !replayMode, replayExecuted: replayMode || replayEnabled(spec) },
    );
  } catch (error) {
    return buildMissingEvidenceResult(
      spec,
      `wallet-withdrawal could not authenticate or reach runtime prerequisites: ${(error as Error).message}.`,
      undefined,
      { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
    );
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function runWhatsappMessageFlow(
  spec: PulseManifestFlowSpec,
  context: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  try {
    const auth = await ensureAuth(context);
    const smokeMode = isTruthyEnv(process.env.PULSE_ALLOW_REAL_WHATSAPP_SEND);
    const testPhone = smokeMode
      ? normalizePhone(getConfiguredTestPhone(context.manifest))
      : getReplayPhone(context.manifest);

    if (smokeMode && !testPhone) {
      return buildMissingEvidenceResult(
        spec,
        'whatsapp-message-send requires an explicit PULSE_TEST_PHONE or adapterConfig.pulseTestPhone to execute the real send smoke safely.',
        undefined,
        { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
      );
    }

    const inboundMarker = `PULSE:IN:${Date.now().toString(36)}`;
    const outboundMarker = `PULSE:OUT:${Date.now().toString(36)}`;

    await fetchJsonWithAuth(
      'POST',
      `/whatsapp/${auth.workspaceId}/opt-in/bulk`,
      auth.token,
      { phones: [testPhone] },
    );

    const incomingRes = await fetchJsonWithAuth(
      'POST',
      `/whatsapp/${auth.workspaceId}/incoming`,
      auth.token,
      { from: testPhone, message: inboundMarker },
    );

    if (!incomingRes.ok || incomingRes.body?.error) {
      const summary = compactSummary(incomingRes.body) || `HTTP ${incomingRes.status}`;
      return isProvisioningGap(summary)
        ? buildMissingEvidenceResult(
            spec,
            `whatsapp-message-send replay could not seed the conversation: ${summary}.`,
            { httpStatus: incomingRes.status, failureCode: inferWhatsappFailureCode(summary) },
            { smokeExecuted: false, replayExecuted: true },
          )
        : buildFailureResult(
            spec,
            `whatsapp-message-send replay failed while seeding the conversation: ${summary}.`,
            { httpStatus: incomingRes.status },
            { smokeExecuted: false, replayExecuted: true },
          );
    }

    let matchedConversationId = '';
    let inboundMessageId = '';
    let outboundMessageId = '';
    let readbackCount = 0;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const conversationsRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/${auth.workspaceId}/conversations`,
        auth.token,
      );

      if (!conversationsRes.ok) {
        await wait(1000);
        continue;
      }

      const conversations = Array.isArray(conversationsRes.body) ? conversationsRes.body as Array<Record<string, unknown>> : [];
      const matchedConversation = conversations.find(item => {
        const contact = item.contact as Record<string, unknown> | undefined;
        return normalizePhone(String(contact?.phone || '')) === testPhone;
      });

      if (!matchedConversation?.id) {
        await wait(1000);
        continue;
      }

      matchedConversationId = String(matchedConversation.id);
      const messagesRes = await fetchJsonWithAuth(
        'GET',
        `/inbox/conversations/${matchedConversationId}/messages`,
        auth.token,
      );

      if (!messagesRes.ok) {
        await wait(1000);
        continue;
      }

      const messages = Array.isArray(messagesRes.body) ? messagesRes.body as Array<Record<string, unknown>> : [];
      readbackCount = messages.length;
      const matchedInbound = messages.find(item => String(item.content || '').includes(inboundMarker));
      if (matchedInbound) {
        inboundMessageId = String(matchedInbound.id || '');
        break;
      }

      await wait(1000);
    }

    if (!matchedConversationId || !inboundMessageId) {
      return buildFailureResult(
        spec,
        'whatsapp-message-send replay could not observe the seeded inbound message in the inbox readback window.',
        {
          testPhone,
          inboundMarker,
          conversationFound: Boolean(matchedConversationId),
          readbackCount,
        },
        { smokeExecuted: false, replayExecuted: true },
      );
    }

    if (smokeMode) {
      const sendRes = await fetchJsonWithAuth(
        'POST',
        `/whatsapp/${auth.workspaceId}/send`,
        auth.token,
        { to: testPhone, message: outboundMarker, externalId: outboundMarker },
      );

      if (!sendRes.ok || sendRes.body?.error) {
        const summary = compactSummary(sendRes.body) || `HTTP ${sendRes.status}`;
        return isProvisioningGap(summary)
          ? buildMissingEvidenceResult(spec, `whatsapp-message-send could not execute in the current runtime: ${summary}.`, {
              httpStatus: sendRes.status,
              failureCode: inferWhatsappFailureCode(summary),
            }, { smokeExecuted: false, replayExecuted: true })
          : buildFailureResult(spec, `whatsapp-message-send request failed: ${summary}.`, {
              httpStatus: sendRes.status,
            }, { smokeExecuted: true, replayExecuted: true });
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const messagesRes = await fetchJsonWithAuth(
          'GET',
          `/inbox/conversations/${matchedConversationId}/messages`,
          auth.token,
        );
        if (!messagesRes.ok) {
          await wait(1500);
          continue;
        }

        const messages = Array.isArray(messagesRes.body) ? messagesRes.body as Array<Record<string, unknown>> : [];
        readbackCount = messages.length;
        const matchedOutbound = messages.find(item => {
          const content = String(item.content || '');
          const externalId = String(item.externalId || '');
          return content.includes(outboundMarker) || externalId === outboundMarker;
        });

        if (matchedOutbound) {
          outboundMessageId = String(matchedOutbound.id || '');
          break;
        }

        await wait(1500);
      }

      if (!outboundMessageId) {
        return buildFailureResult(
          spec,
          'whatsapp-message-send returned success but the inbox persistence oracle did not observe the outbound message in the conversation readback window.',
          {
            testPhone,
            inboundMarker,
            outboundMarker,
            conversationId: matchedConversationId,
            readbackCount,
          },
          { smokeExecuted: true, replayExecuted: true },
        );
      }

      return buildPassedResult(
        spec,
        `whatsapp-message-send passed with conversation ${matchedConversationId} and outbound message ${outboundMessageId}.`,
        {
          testPhone,
          inboundMarker,
          outboundMarker,
          conversationId: matchedConversationId,
          inboundMessageId,
          messageId: outboundMessageId,
          readbackCount,
        },
        { smokeExecuted: true, replayExecuted: true },
      );
    }

    return buildPassedResult(
      spec,
      `whatsapp-message-send replay passed via seeded inbox conversation ${matchedConversationId}. Final outbound smoke remains opt-in.`,
      {
        testPhone,
        inboundMarker,
        conversationId: matchedConversationId,
        inboundMessageId,
        readbackCount,
        smokePending: spec.smokeRequired,
      },
      { smokeExecuted: false, replayExecuted: true },
    );
  } catch (error) {
    return buildMissingEvidenceResult(
      spec,
      `whatsapp-message-send could not authenticate or reach runtime prerequisites: ${(error as Error).message}.`,
      undefined,
      { smokeExecuted: false, replayExecuted: replayEnabled(spec) },
    );
  }
}

function buildCheckerGapResult(spec: PulseManifestFlowSpec, missingChecks: string[]): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'failed',
    executed: false,
    accepted: false,
    providerModeUsed: spec.providerMode,
    smokeExecuted: false,
    replayExecuted: replayEnabled(spec),
    failureClass: 'checker_gap',
    summary: `Required flow preconditions are not loaded: ${missingChecks.join(', ')}.`,
    artifactPaths: getArtifactPaths(spec.id),
    metrics: {
      missingChecks: missingChecks.join(', '),
    },
  };
}

function annotateIgnoredMissingChecks(
  result: PulseFlowResult,
  missingChecks: string[],
): PulseFlowResult {
  if (missingChecks.length === 0) return result;
  return {
    ...result,
    metrics: {
      ...(result.metrics || {}),
      ignoredMissingChecks: missingChecks.join(', '),
    },
  };
}

async function evaluateFlowSpec(
  spec: PulseManifestFlowSpec,
  input: RunDeclaredFlowsInput,
  loadedChecks: Set<string>,
  runtimeContext: FlowRuntimeContext,
): Promise<PulseFlowResult> {
  const acceptance = getActiveFlowAcceptance(input.manifest, spec.id);
  if (acceptance) {
    return {
      flowId: spec.id,
      status: 'accepted',
      executed: false,
      accepted: true,
      providerModeUsed: spec.providerMode,
      smokeExecuted: false,
      replayExecuted: replayEnabled(spec),
      summary: `Temporarily accepted until ${acceptance.expiresAt}: ${acceptance.reason}`,
      artifactPaths: getArtifactPaths(spec.id),
      metrics: {
        expiresAt: acceptance.expiresAt,
      },
    };
  }

  const missingChecks = spec.preconditions.filter(name => !loadedChecks.has(name));
  const enforceDiagnosticPreconditions = input.enforceDiagnosticPreconditions !== false;
  if (missingChecks.length > 0 && enforceDiagnosticPreconditions) {
    return buildCheckerGapResult(spec, missingChecks);
  }

  if (spec.id === 'wallet-withdrawal') {
    return annotateIgnoredMissingChecks(await runWalletWithdrawalFlow(spec, runtimeContext), missingChecks);
  }

  if (spec.id === 'whatsapp-message-send') {
    return annotateIgnoredMissingChecks(await runWhatsappMessageFlow(spec, runtimeContext), missingChecks);
  }

  const patterns = FLOW_BREAK_PATTERNS[spec.id] || [];
  const matchingBreaks = collectMatchingBreaks(input.health, patterns);

  if (matchingBreaks.length > 0) {
    return annotateIgnoredMissingChecks({
      flowId: spec.id,
      status: 'failed',
      executed: true,
      accepted: false,
      providerModeUsed: spec.providerMode,
      smokeExecuted: smokeEnabled(spec),
      replayExecuted: replayEnabled(spec),
      failureClass: 'product_failure',
      summary: `Blocking findings for ${spec.id}: ${[...new Set(matchingBreaks.map(item => item.type))].join(', ')}.`,
      artifactPaths: getArtifactPaths(spec.id),
      metrics: {
        breakCount: matchingBreaks.length,
      },
    }, missingChecks);
  }

  return annotateIgnoredMissingChecks({
    flowId: spec.id,
    status: 'passed',
    executed: true,
    accepted: false,
    providerModeUsed: spec.providerMode,
    smokeExecuted: smokeEnabled(spec),
    replayExecuted: replayEnabled(spec),
    summary: `${spec.id} passed its declared oracle (${spec.oracle}) in ${input.environment} mode.`,
    artifactPaths: getArtifactPaths(spec.id),
    metrics: {
      oracle: spec.oracle,
      runner: spec.runner,
      smokeRequired: spec.smokeRequired,
      providerMode: spec.providerMode,
    },
  }, missingChecks);
}

function buildSummary(results: PulseFlowResult[]): string {
  if (results.length === 0) {
    return 'No flow specs are required in the current environment.';
  }

  const passed = results.filter(item => item.status === 'passed').length;
  const failed = results.filter(item => item.status === 'failed').length;
  const accepted = results.filter(item => item.status === 'accepted').length;
  const missing = results.filter(item => item.status === 'missing_evidence').length;

  return `Flow evidence summary: ${passed} passed, ${failed} failed, ${accepted} accepted, ${missing} missing evidence.`;
}

export async function runDeclaredFlows(input: RunDeclaredFlowsInput): Promise<PulseFlowEvidence> {
  const allowedFlowIds = new Set(input.flowIds || []);
  const specs = getApplicableSpecs(input.environment, input.manifest).filter(spec =>
    allowedFlowIds.size === 0 || allowedFlowIds.has(spec.id),
  );
  const loadedChecks = getLoadedCheckNames(input.parserInventory);
  const results: PulseFlowResult[] = [];
  const runtimeContext: FlowRuntimeContext = {
    manifest: input.manifest,
    runtimeResolution: getRuntimeResolution(),
    authPromise: null,
  };

  for (const spec of specs) {
    const result = await evaluateFlowSpec(spec, input, loadedChecks, runtimeContext);
    results.push(result);
  }

  return {
    declared: specs.map(spec => spec.id),
    executed: results.filter(item => item.executed).map(item => item.flowId),
    missing: results.filter(item => item.status === 'missing_evidence').map(item => item.flowId),
    passed: results.filter(item => item.status === 'passed').map(item => item.flowId),
    failed: results.filter(item => item.status === 'failed').map(item => item.flowId),
    accepted: results.filter(item => item.accepted).map(item => item.flowId),
    artifactPaths: specs.length > 0
      ? [...new Set([FLOW_ARTIFACT, ...results.flatMap(item => item.artifactPaths)])]
      : [],
    summary: buildSummary(results),
    results,
  };
}
