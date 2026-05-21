/**
 * UTP-LEGIT-002 — Consent Ledger.
 *
 * Immutable consent tracking: grant, withdraw, verify.
 * Each consent state change creates an auditable record
 * with evidence hash.
 *
 * Pure function — stateless consent ledger operations.
 */

import type { ConsentBasis, ConsentInput, ConsentRecord, ConsentResult } from './types';
import { generateId } from './types';

function hashEvidence(input: ConsentInput): string {
  const payload = [
    input.workspaceId,
    input.userId,
    input.purpose,
    input.basis,
    input.jurisdiction,
    input.action,
    input.nowMs ?? Date.now(),
  ].join('::');
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const chr = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `ev_${Math.abs(hash).toString(36)}`;
}

function consentExpiresAt(basis: ConsentBasis, nowMs: number): string | null {
  if (basis === 'explicit') {
    return new Date(nowMs + 365 * 24 * 3600_000).toISOString();
  }
  if (basis === 'contractual') {
    return new Date(nowMs + 730 * 24 * 3600_000).toISOString();
  }
  return null;
}

export function manageConsent(input: ConsentInput): ConsentResult {
  const nowMs = input.nowMs ?? Date.now();
  const evidenceHash = hashEvidence(input);

  if (input.action === 'withdraw' || input.action === 'verify') {
    const record: ConsentRecord = {
      consentId: generateId('consent'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      purpose: input.purpose,
      basis: input.basis,
      jurisdiction: input.jurisdiction,
      status: input.action === 'withdraw' ? 'withdrawn' : 'granted',
      grantedAt: new Date(nowMs).toISOString(),
      withdrawnAt: input.action === 'withdraw' ? new Date(nowMs).toISOString() : null,
      expiresAt: input.action === 'withdraw' ? null : consentExpiresAt(input.basis, nowMs),
      evidenceHash,
      metadata: input.metadata ?? {},
      createdAt: new Date(nowMs).toISOString(),
    };
    return {
      success: true,
      record,
      action: input.action,
    };
  }

  const record: ConsentRecord = {
    consentId: generateId('consent'),
    workspaceId: input.workspaceId,
    userId: input.userId,
    purpose: input.purpose,
    basis: input.basis,
    jurisdiction: input.jurisdiction,
    status: 'granted',
    grantedAt: new Date(nowMs).toISOString(),
    withdrawnAt: null,
    expiresAt: consentExpiresAt(input.basis, nowMs),
    evidenceHash,
    metadata: input.metadata ?? {},
    createdAt: new Date(nowMs).toISOString(),
  };

  return {
    success: true,
    record,
    action: 'grant',
  };
}
