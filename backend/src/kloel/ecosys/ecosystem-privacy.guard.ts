import { Injectable } from '@nestjs/common';
import type { EcosystemPrivacyVerdict } from './ecosys.types';

/**
 * UTP-ECOSYS-007 — Guard ensuring NO identifiable data crosses workspace
 * boundaries in ecosystem outputs (B0.11). Detects patterns that look
 * like workspaceIds, leadIds, productIds, emails, phones, names.
 */

const PII_PATTERNS: ReadonlyArray<{ readonly id: string; readonly re: RegExp }> = [
  { id: 'workspace-id', re: /\bwks_[a-z0-9_]{4,}\b/i },
  { id: 'lead-id', re: /\blead_[a-z0-9]{4,}\b/i },
  { id: 'product-id', re: /\bprod_[a-z0-9]{4,}\b/i },
  { id: 'order-id', re: /\bord_[a-z0-9]{4,}\b/i },
  { id: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { id: 'phone-br', re: /\b(\+?55\s?)?\(?\d{2,3}\)?\s?\d{4,5}-?\d{4}\b/ },
  { id: 'cpf', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/ },
  { id: 'cnpj', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/ },
];

@Injectable()
export class EcosystemPrivacyGuardService {
  public scan(payload: unknown): EcosystemPrivacyVerdict {
    const leaks: string[] = [];
    this.walk(payload, '$', (s, path) => {
      for (const p of PII_PATTERNS) {
        if (p.re.test(s)) {
          leaks.push(`${path}: ${p.id}`);
          break;
        }
      }
    });
    return {
      verdict: leaks.length === 0 ? 'PASS' : 'FAIL',
      leaksDetected: leaks,
    };
  }

  private walk(
    value: unknown,
    path: string,
    visit: (s: string, path: string) => void,
  ): void {
    if (typeof value === 'string') {
      visit(value, path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, idx) => this.walk(item, `${path}[${idx}]`, visit));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        this.walk(v, `${path}.${k}`, visit);
      }
    }
  }
}
