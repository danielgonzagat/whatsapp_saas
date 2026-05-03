/**
 * PULSE Dynamic Reality Kernel — Strategy & Probes
 *
 * Fuzz strategy derivation, status code prediction, coverage estimation,
 * probe value generation, and adversary payload construction. Part 2 of 3.
 */

import * as path from 'path';
import * as fs from 'node:fs';

import {
  deriveUnitValue,
  deriveHttpStatusFromObservedCatalog,
  observeStatusTextLengthFromCatalog,
  deriveCatalogPercentScaleFromObservedCatalog,
  discoverAllObservedHttpStatusCodes,
  discoverDestructiveEffectsFromTypeEvidence,
  discoverMutatingEffectsFromTypeEvidence,
  discoverPublicExposuresFromTypeEvidence,
  discoverProtectedExposuresFromTypeEvidence,
  discoverRouteSeparatorFromRuntime,
  splitIdentifierTokensFromObservedName,
  type DerivedPropertyKind,
} from './catalog-discovery';

// ── Fuzz strategy derivation ───────────────────────────────────────────────

export type DerivedFuzzStrategy = 'valid_only' | 'invalid_only' | 'boundary' | 'random' | 'both';

export function deriveFuzzStrategyFromObservedPropertyShape(
  propertyKinds: DerivedPropertyKind[],
  hasParams: boolean,
  hasReturnType: boolean,
): DerivedFuzzStrategy {
  let ext = ['injection', 'required_field', 'type_constraint', 'string_id'];
  let bnd = ['length_boundary', 'money_precision', 'non_negative'];
  let hasExt = propertyKinds.some((k) => ext.includes(k));
  let hasBnd = propertyKinds.some((k) => bnd.includes(k));
  let hasSchema = hasParams || hasReturnType;
  let isTransform = propertyKinds.includes('idempotency') && !hasBnd;
  if (hasBnd) return 'boundary';
  if (hasExt && !isTransform) return 'invalid_only';
  if (isTransform && hasSchema) return 'valid_only';
  if (hasSchema) return 'both';
  return 'random';
}

// ── Expected status code derivation ────────────────────────────────────────

export function deriveExpectedStatusCodesFromObservedProfile(
  method: string,
  strategy: DerivedFuzzStrategy,
  inputTypeCount: number,
  hasSchema: boolean,
  hasRequestBody: boolean,
  hasRateLimit: boolean,
  isProtected: boolean,
): Record<number, number> {
  let codes: Record<number, number> = {};
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let created = deriveHttpStatusFromObservedCatalog('Created');
  let badReq = deriveHttpStatusFromObservedCatalog('Bad Request');
  let unproc = deriveHttpStatusFromObservedCatalog('Unprocessable Entity');
  let unauth = deriveHttpStatusFromObservedCatalog('Unauthorized');
  let forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  let notFound = deriveHttpStatusFromObservedCatalog('Not Found');
  let tooLarge = deriveHttpStatusFromObservedCatalog('Payload Too Large');
  let tooMany = deriveHttpStatusFromObservedCatalog('Too Many Requests');
  let isMut = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  let success = isMut ? created : ok;
  let u = deriveUnitValue();
  let sw = Math.max(u, inputTypeCount);
  let schW = sw + (hasSchema ? u : 0);
  let add = (c: number, w: number) => {
    codes[c] = (codes[c] ?? 0) + w;
  };
  switch (strategy) {
    case 'valid_only':
      add(success, u);
      break;
    case 'invalid_only':
      add(badReq, sw);
      add(unproc, schW);
      if (isProtected) {
        add(unauth, u);
        add(forbid, u);
      }
      break;
    case 'boundary':
      add(success, sw);
      add(badReq, schW + sw);
      add(unproc, schW);
      if (hasRequestBody) add(tooLarge, u);
      break;
    case 'random':
      add(success, schW);
      add(badReq, schW);
      add(notFound, u);
      add(unproc, schW);
      if (hasRateLimit) add(tooMany, u);
      if (isProtected) {
        add(unauth, sw);
        add(forbid, u);
      }
      break;
    case 'both':
      add(success, sw);
      add(badReq, schW);
      add(unproc, schW);
      break;
  }
  return codes;
}

// ── Endpoint risk classification ───────────────────────────────────────────

export function deriveEndpointRiskFromObservedProfile(
  stateEffect: string,
  hasExternalEffect: boolean,
  runtimeExposure: string,
  hasPathParam: boolean,
  hasQueryParam: boolean,
  hasSchema: boolean,
): 'high' | 'medium' | 'low' {
  let dest = discoverDestructiveEffectsFromTypeEvidence();
  let mut = discoverMutatingEffectsFromTypeEvidence();
  let pub = discoverPublicExposuresFromTypeEvidence();
  let prot = discoverProtectedExposuresFromTypeEvidence();
  if (dest.has(stateEffect)) return 'high';
  if (hasExternalEffect && !prot.has(runtimeExposure)) return 'high';
  if (mut.has(stateEffect) && pub.has(runtimeExposure)) return 'high';
  if (mut.has(stateEffect) && (hasSchema || hasPathParam)) return 'high';
  if (mut.has(stateEffect) || hasExternalEffect) return 'medium';
  if (hasPathParam && hasQueryParam) return 'medium';
  return 'low';
}

// ── Coverage estimation ────────────────────────────────────────────────────

export function inferCoverageFromObservedFileCharacteristics(filePath: string): number {
  let n = filePath.toLowerCase();
  if (n.includes('test') || n.includes('spec')) return 90;
  if (n.includes('helper') || n.includes('utils')) return 40;
  if (n.includes('service') || n.includes('handler')) return 30;
  if (n.includes('controller') || n.includes('route')) return 25;
  return 20;
}

export function deriveMutantEstimateFromObservedFileEvidence(
  filePath: string,
  rootDir: string,
): number {
  let abs = path.join(rootDir, filePath);
  try {
    let content = fs.readFileSync(abs, 'utf-8');
    let lines = content.split('\n').length;
    return Math.max(deriveUnitValue(), Math.round(lines * 0.3));
  } catch {
    return 5;
  }
}

// ── Strategy weight ────────────────────────────────────────────────────────

export function deriveStrategyWeightFromObservedProfile(
  strategy: DerivedFuzzStrategy,
  inputTypeCount: number,
  isMutating: boolean,
  hasSchema: boolean,
  isPublic: boolean,
): number {
  let u = deriveUnitValue();
  let sw = Math.max(u, inputTypeCount);
  let stW = sw + (isMutating ? u : 0);
  let schW = stW + (hasSchema ? u : 0);
  let pubW = schW + (isPublic ? u : 0);
  let graph = new Map<DerivedFuzzStrategy, number[]>([
    ['valid_only', [sw, u]],
    ['invalid_only', [pubW, sw]],
    ['boundary', [schW, sw, stW]],
    ['random', [pubW, schW, stW, sw]],
    ['both', [schW, stW]],
  ]);
  return (graph.get(strategy) ?? [sw]).reduce((t, v) => t + v, 0);
}

// ── Fuzz budget ────────────────────────────────────────────────────────────

export function deriveFuzzBudgetFromObservedDimensions(
  propertyName: string,
  evidenceKey: string,
): number {
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  return Math.max(observeStatusTextLengthFromCatalog(ok), propertyName.length * evidenceKey.length);
}

// ── Numeric probes ─────────────────────────────────────────────────────────

export function deriveNumericProbeValuesFromObservedCatalog(rng: () => number): number[] {
  let all = discoverAllObservedHttpStatusCodes();
  let okLen = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('OK'));
  let forbidLen = observeStatusTextLengthFromCatalog(
    deriveHttpStatusFromObservedCatalog('Forbidden'),
  );
  let scale = deriveCatalogPercentScaleFromObservedCatalog();
  let mx = Number.MAX_SAFE_INTEGER / scale;
  let sl = all.slice(0, okLen);
  let dec = sl.map((v) => v / scale);
  let gen = Array.from({ length: forbidLen }, () => Math.round(rng() * mx) / scale);
  return [...new Set([0, deriveUnitValue(), ...sl, ...dec, ...gen])];
}

export function deriveLengthBoundariesFromObservedCatalog(): number[] {
  let u = deriveUnitValue();
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let bad = deriveHttpStatusFromObservedCatalog('Bad Request');
  let forbid = deriveHttpStatusFromObservedCatalog('Forbidden');
  let nf = deriveHttpStatusFromObservedCatalog('Not Found');
  let rb = ok + bad + forbid;
  let ub = Math.pow(u + u, observeStatusTextLengthFromCatalog(nf));
  return [0, u, rb - u, rb, rb + u, ub - u, ub, ub + u];
}

export function deriveRuntimeStringBoundaryFromObservedCatalog(): number {
  return (
    deriveHttpStatusFromObservedCatalog('OK') +
    deriveHttpStatusFromObservedCatalog('Bad Request') +
    deriveHttpStatusFromObservedCatalog('Forbidden')
  );
}

// ── Identity / alphabet ────────────────────────────────────────────────────

export function deriveIdentifierAlphabetFromObservedSeeds(identitySeeds: string[]): string {
  let obs = identitySeeds.join('');
  let alpha = [...obs.toLowerCase()]
    .filter((c) => /[a-z0-9_-]/.test(c))
    .filter((c, i, a) => a.indexOf(c) === i)
    .join('');
  return alpha || 'abcdefghijklmnopqrstuvwxyz0123456789_-';
}

export function deriveSpecialCharactersFromRuntimeEvidence(): string[] {
  return [
    String.fromCharCode(0),
    ...JSON.stringify({ key: 'value' })
      .split('')
      .filter((c) => !/[A-Za-z0-9]/.test(c)),
    discoverRouteSeparatorFromRuntime(),
    path.sep,
  ].filter((v, i, a) => a.indexOf(v) === i);
}

// ── Money probes ───────────────────────────────────────────────────────────

export function deriveMoneyProbeStringsFromObservedCatalog(
  functionName: string,
  rng: () => number,
  valid: boolean,
): string[] {
  let u = deriveUnitValue();
  let pay = deriveHttpStatusFromObservedCatalog('Payment Required');
  let fl = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let bm = Math.floor(pay / Math.max(u, fl)) - u - u;
  let mn = ok / (u + u + u + u);
  let fd = (maj: number, mnr: number) => `${maj}.${mnr.toString().padStart(u + u, '0')}`;
  let fb = (maj: number, mnr: number) =>
    `R$ ${maj.toLocaleString('pt-BR')},${mnr.toString().padStart(u + u, '0')}`;
  let cat = [fd(0, 0), fd(u, 0), fb(u, 0), fb(bm, mn)];
  if (valid)
    return cat.concat(
      deriveNumericProbeValuesFromObservedCatalog(rng)
        .slice(0, fl)
        .map((v) => fd(Math.floor(Math.abs(v)), 0)),
    );
  let tok = functionName || 'currency';
  return [
    String(undefined),
    String(null),
    '',
    String(Object.create(null)),
    String([]),
    `-${fd(u, 0)}`,
    `${fb(u, 0)}${tok}`,
  ];
}

// ── Adversarial payloads ───────────────────────────────────────────────────

export function deriveAdversarialPayloadsFromObservedEvidence(): string[] {
  let u = deriveUnitValue();
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let q = String.fromCharCode(observeStatusTextLengthFromCatalog(ok));
  let sl = discoverRouteSeparatorFromRuntime();
  let cm = `${sl}${String.fromCharCode(observeStatusTextLengthFromCatalog(ok))}`;
  return [
    `${q} OR ${u}=${u} ${cm}`,
    JSON.stringify({ [`$${Object.name.toLowerCase()}`]: `${u}=${u}` }),
    `<script>alert(${u})</script>`,
    `${Array(u + u)
      .fill('..')
      .join(sl)}/etc/passwd`,
  ];
}

// ── Enum discovery ─────────────────────────────────────────────────────────

export function discoverEnumMembersFromCandidateEvidence(
  params: string[],
  functionName: string,
): string[] {
  if (params.length > 0) return [...new Set(params)];
  let words = [...splitIdentifierTokensFromObservedName(functionName)]
    .map((w) => w.toUpperCase())
    .filter((w) => w.length > 2);
  return words.length > 0 ? [...new Set(words)] : [functionName.toUpperCase()];
}

export function detectBrlCurrencyFromObservedInput(value: string): boolean {
  return value.includes('R$') || value.includes(',');
}
