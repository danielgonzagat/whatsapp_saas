import { Injectable } from '@nestjs/common';
import type { Role, RoleFitMatch } from './ecosys.types';

/**
 * UTP-ECOSYS-002..005 — Per-role-pair fit detectors. Each function takes
 * anonymized workspace fingerprints + tokenized capability/need signals
 * and returns RoleFitMatch entries when both sides have compatible
 * signals.
 */

interface FingerprintProfile {
  readonly workspaceFingerprint: string;
  readonly role: Role;
  readonly capabilities: readonly string[];
  readonly needs: readonly string[];
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function makeFit(
  prefix: string,
  a: FingerprintProfile,
  b: FingerprintProfile,
  score: number,
  reasonTokens: readonly string[],
): RoleFitMatch {
  return {
    fitId: `${prefix}_${a.workspaceFingerprint}_${b.workspaceFingerprint}`,
    producerWorkspaceFingerprint: a.workspaceFingerprint,
    partnerWorkspaceFingerprint: b.workspaceFingerprint,
    roleA: a.role,
    roleB: b.role,
    score,
    reasonTokens,
  };
}

function fitBetween(
  profiles: readonly FingerprintProfile[],
  rolePairs: readonly [Role, Role][],
  threshold: number,
  prefix: string,
): readonly RoleFitMatch[] {
  const out: RoleFitMatch[] = [];
  for (const a of profiles) {
    for (const b of profiles) {
      if (a.workspaceFingerprint === b.workspaceFingerprint) continue;
      const matchPair = rolePairs.find(([x, y]) => a.role === x && b.role === y);
      if (!matchPair) continue;
      const score = jaccard(a.capabilities, b.needs);
      if (score < threshold) continue;
      const reason = a.capabilities.filter((c) => b.needs.includes(c));
      out.push(makeFit(prefix, a, b, score, reason));
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

@Injectable()
export class ProducerAffiliateFitService {
  public detect(profiles: readonly FingerprintProfile[]): readonly RoleFitMatch[] {
    return fitBetween(profiles, [['produtor', 'afiliado']], 0.2, 'pa');
  }
}

@Injectable()
export class AffiliateProductFitService {
  public detect(profiles: readonly FingerprintProfile[]): readonly RoleFitMatch[] {
    return fitBetween(profiles, [['afiliado', 'produtor']], 0.2, 'ap');
  }
}

@Injectable()
export class CreatorOfferFitService {
  public detect(profiles: readonly FingerprintProfile[]): readonly RoleFitMatch[] {
    return fitBetween(
      profiles,
      [['creator', 'produtor'], ['creator', 'afiliado']],
      0.2,
      'co',
    );
  }
}

@Injectable()
export class AgencySellerFitService {
  public detect(profiles: readonly FingerprintProfile[]): readonly RoleFitMatch[] {
    return fitBetween(
      profiles,
      [['agencia', 'closer'], ['agencia', 'gestor']],
      0.2,
      'as',
    );
  }
}

export type { FingerprintProfile };
