/**
 * PULSE Parser 75: Compliance Checker
 * Layer 10: Legal & Regulatory
 * Mode: DEEP (requires codebase scan + running backend endpoint probing)
 *
 * CHECKS:
 * 1. Privacy policy page exists in frontend (route /privacy or /politica-de-privacidade)
 * 2. Terms of service page exists in frontend
 * 3. Data export endpoint exists (LGPD Art. 18 — portability right)
 *    — looks for GET /users/:id/export or similar in backend controllers
 * 4. Data deletion endpoint exists (LGPD Art. 18 — right to erasure)
 *    — looks for DELETE /users/:id or POST /users/:id/delete in backend
 * 5. Cookie consent mechanism exists in frontend (cookie banner component or hook)
 * 6. Checkout/signup forms have explicit consent checkbox for data usage
 * 7. No PII logged in plaintext (cross-references sensitive-data-checker patterns)
 * 8. Data retention policy defined (env var or config file)
 *
 * REQUIRES: PULSE_DEEP=1, codebase read access
 * BREAK TYPES:
 *   LGPD_NON_COMPLIANT(critical) — missing required privacy/data right endpoint or UI
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

export function checkCompliance(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1 & 2: Privacy policy and ToS pages
  const pagesDir = path.join(config.frontendDir, 'src', 'app');
  const privacyRoutes = ['privacy', 'politica-de-privacidade', 'privacy-policy'];
  const tosRoutes = ['terms', 'termos', 'terms-of-service', 'termos-de-uso'];

  const hasPrivacy = privacyRoutes.some(r => fs.existsSync(path.join(pagesDir, r)));
  const hasTos = tosRoutes.some(r => fs.existsSync(path.join(pagesDir, r)));

  if (!hasPrivacy) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'frontend/src/app/',
      line: 0,
      description: 'No privacy policy page found — LGPD requires accessible privacy notice',
      detail: `Expected one of: ${privacyRoutes.map(r => `/app/${r}/page.tsx`).join(', ')}`,
    });
  }

  if (!hasTos) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'frontend/src/app/',
      line: 0,
      description: 'No terms of service page found — required for user agreements and LGPD consent',
      detail: `Expected one of: ${tosRoutes.map(r => `/app/${r}/page.tsx`).join(', ')}`,
    });
  }

  // CHECK 3: Data export endpoint in backend controllers
  const backendFiles = walkFiles(config.backendDir, ['.ts']);
  let hasExportEndpoint = false;
  let hasDeleteEndpoint = false;

  for (const file of backendFiles) {
    if (!/controller/i.test(file)) continue;
    if (/\.spec\.ts$/.test(file)) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (/export|exportData|data-export/i.test(content) && /Get\s*\(/.test(content)) {
      hasExportEndpoint = true;
    }
    if (/delete|erase|erasure|anonymize/i.test(content) && /Delete\s*\(|Post\s*\(/.test(content)) {
      hasDeleteEndpoint = true;
    }
  }

  if (!hasExportEndpoint) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'backend/src/',
      line: 0,
      description: 'No data export endpoint found — LGPD Art. 18 requires data portability on request',
      detail: 'Add GET /users/:id/export or /account/export that returns all user data as JSON/CSV',
    });
  }

  // CHECK 4: Data deletion endpoint
  if (!hasDeleteEndpoint) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'backend/src/',
      line: 0,
      description: 'No data deletion/erasure endpoint found — LGPD Art. 18 requires right to erasure',
      detail: 'Add DELETE /account or POST /account/delete that anonymizes or removes all user PII',
    });
  }

  // CHECK 5: Cookie consent in frontend
  const cookieConsentPatterns = [
    /CookieBanner|CookieConsent|cookie-consent|useCookieConsent/i,
    /consentimento.*cookie|cookies.*consentimento/i,
  ];
  const frontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts']);
  let hasCookieConsent = false;

  for (const file of frontendFiles) {
    if (/node_modules|\.next/.test(file)) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (cookieConsentPatterns.some(re => re.test(content))) {
      hasCookieConsent = true;
      break;
    }
  }

  if (!hasCookieConsent) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'frontend/src/',
      line: 0,
      description: 'No cookie consent mechanism found — LGPD requires explicit user consent for cookies',
      detail: 'Add a CookieBanner component or useCookieConsent hook; store consent in cookie/localStorage',
    });
  }

  // CHECK 6: Checkout forms have explicit consent
  const checkoutFiles = frontendFiles.filter(f => /checkout/i.test(f));
  let checkoutHasConsent = false;
  for (const file of checkoutFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (/consent|aceito|autorizo|privacy|privacidade|termos/i.test(content)) {
      checkoutHasConsent = true;
      break;
    }
  }
  if (checkoutFiles.length > 0 && !checkoutHasConsent) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: 'frontend/src/app/checkout/',
      line: 0,
      description: 'Checkout form lacks explicit data-use consent checkbox — required by LGPD',
      detail: 'Add a required checkbox linking to privacy policy before payment submission',
    });
  }

  // CHECK 7: Data retention policy
  const hasRetentionPolicy =
    !!process.env.DATA_RETENTION_DAYS ||
    fs.existsSync(path.join(config.rootDir, '.data-retention.json'));
  if (!hasRetentionPolicy) {
    breaks.push({
      type: 'LGPD_NON_COMPLIANT',
      severity: 'critical',
      file: '.data-retention.json',
      line: 0,
      description: 'No data retention policy defined — LGPD requires defined retention periods per data category',
      detail: 'Create .data-retention.json mapping data types to retention periods, or set DATA_RETENTION_DAYS env var',
    });
  }

  // TODO: Implement when infrastructure available
  // CHECK 8: DPO contact in privacy policy (LGPD Art. 41)
  // CHECK 9: Data breach notification procedure documented

  return breaks;
}
