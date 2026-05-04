import { randomBytes } from 'node:crypto';
import type { PulseManifest, PulseManifestFlowSpec } from '../../../types';
import type { AuthCredentials } from '../../../browser-stress-tester/types';
import { DEFAULT_REPLAY_TEST_PHONE, FLOW_ARTIFACT } from './types-and-config';

export function replayEnabled(spec: PulseManifestFlowSpec): boolean {
  return spec.providerMode === 'replay' || spec.providerMode === 'hybrid';
}

export function smokeEnabled(spec: PulseManifestFlowSpec): boolean {
  if (!spec.smokeRequired) {
    return false;
  }
  return spec.providerMode === 'real_smoke' || spec.providerMode === 'hybrid';
}

export function getArtifactPaths(flowId: string): string[] {
  void flowId;
  return [FLOW_ARTIFACT];
}

function getManifestAdapterValue<T>(manifest: PulseManifest | null, key: string): T | undefined {
  const config = manifest?.adapterConfig;
  if (!config || typeof config !== 'object') {
    return undefined;
  }
  return (config as Record<string, unknown>)[key] as T | undefined;
}

export function isTruthyEnv(value: string | undefined | null): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

export function getConfiguredTestPhone(manifest: PulseManifest | null): string | null {
  const envPhone = process.env.PULSE_TEST_PHONE || process.env.E2E_TEST_PHONE;
  const manifestPhone = getManifestAdapterValue<string>(manifest, 'pulseTestPhone');
  const phone = String(envPhone || manifestPhone || '').trim();
  return phone || null;
}

export function getReplayPhone(manifest: PulseManifest | null): string {
  const configured = normalizePhone(getConfiguredTestPhone(manifest));
  return configured || DEFAULT_REPLAY_TEST_PHONE;
}

export function getConfiguredWithdrawalAmount(manifest: PulseManifest | null): number {
  const envAmount = process.env.PULSE_WALLET_WITHDRAWAL_AMOUNT;
  const manifestAmount = getManifestAdapterValue<number | string>(
    manifest,
    'pulseWalletWithdrawalAmount',
  );
  const parsed = Number(envAmount || manifestAmount || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function titleFromEvidenceToken(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function deriveReplayBirthDate(seed: string): string {
  const checksum = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  const now = new Date();
  const adultYear = now.getUTCFullYear() - (25 + (checksum % 20));
  const month = checksum % 12;
  const day = (checksum % 27) + 1;
  return new Date(Date.UTC(adultYear, month, day)).toISOString().slice(0, 10);
}

export function buildReplayProfilePayload(
  manifest: PulseManifest | null,
  auth: AuthCredentials,
  replayPhone: string,
  replayMarker: string,
): Record<string, unknown> {
  const configured = getManifestAdapterValue<unknown>(manifest, 'pulseKycProfile');
  if (isRecord(configured)) {
    return {
      ...configured,
      phone: String(configured.phone || replayPhone),
      birthDate: String(configured.birthDate || deriveReplayBirthDate(replayMarker)),
    };
  }

  const identity = titleFromEvidenceToken(auth.email.split('@')[0] || auth.workspaceId);
  const name = identity ? `${identity} ${replayMarker}` : replayMarker;
  return {
    name,
    publicName: identity || replayMarker,
    phone: replayPhone,
    birthDate: deriveReplayBirthDate(replayMarker),
  };
}

export function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/\D+/g, '');
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function compactSummary(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => compactSummary(item))
      .filter(Boolean)
      .join('; ');
  }
  if (value && typeof value === 'object') {
    const maybeMessage = (value as Record<string, unknown>).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage.trim();
    }
    const maybeError = (value as Record<string, unknown>).error;
    if (typeof maybeError === 'string') {
      return maybeError.trim();
    }
  }
  return '';
}

export function isProvisioningGap(summary: string): boolean {
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
  ].some((token) => lowered.includes(token));
}

export function buildPulseSuffix(prefix: string): string {
  const random = randomBytes(3).toString('hex');
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function buildProductSlug(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function isTransportGap(status: number, summary: string): boolean {
  const lowered = summary.toLowerCase();
  return (
    status === 0 ||
    lowered.includes('timed out') ||
    lowered.includes('fetch failed') ||
    lowered.includes('request failed') ||
    lowered.includes('enotfound') ||
    lowered.includes('econnrefused') ||
    lowered.includes('econnreset') ||
    lowered.includes('socket hang up') ||
    lowered.includes('aborted')
  );
}
