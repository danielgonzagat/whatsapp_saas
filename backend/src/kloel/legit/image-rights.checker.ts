/**
 * UTP-LEGIT-009 — Image Rights Checker.
 *
 * Validates image usage rights: stock, licensed, AI-generated,
 * user-uploaded, third-party, commissioned.
 * Detects missing attribution, expired licenses, unlicensed use,
 * and potential rights violations.
 *
 * Pure function — stateless image rights validation.
 */

import type { ImageRightsInput, ImageRightsResult, ImageRightsStatus, PolicyViolation } from './types';
import { generateId } from './types';

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function checkImageRights(input: ImageRightsInput): ImageRightsResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];

  if (!isValidUrl(input.imageUrl)) {
    violations.push({
      violationId: generateId('img_viol'),
      workspaceId: input.workspaceId,
      userId: null,
      policyName: 'image_rights_url',
      severity: 'moderate',
      description: 'Invalid image URL provided.',
      source: 'image-rights.checker',
      evidence: [`invalid_url:${input.imageUrl}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
    return {
      valid: false,
      record: {
        imageId: generateId('img'),
        workspaceId: input.workspaceId,
        source: input.source,
        status: 'violation_detected',
        url: input.imageUrl,
        licenseRef: null,
        attribution: null,
        licensee: null,
        expiresAt: null,
        verifiedAt: null,
        createdAt: new Date(nowMs).toISOString(),
      },
      violations,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  let status: ImageRightsStatus = 'pending_review';

  if (input.source === 'stock' && input.licenseRef) {
    status = 'verified';
  } else if (input.source === 'licensed' && input.licenseRef && input.licensee) {
    if (input.expiresAt) {
      const expiryMs = Date.parse(input.expiresAt);
      if (Number.isFinite(expiryMs) && expiryMs < nowMs) {
        status = 'license_expired';
        violations.push({
          violationId: generateId('img_viol'),
          workspaceId: input.workspaceId,
          userId: null,
          policyName: 'image_rights_expired',
          severity: 'moderate',
          description: `Image license expired at ${input.expiresAt}.`,
          source: 'image-rights.checker',
          evidence: [`expired_license:${input.licenseRef}`],
          detectedAt: new Date(nowMs).toISOString(),
          resolvedAt: null,
        });
      } else {
        status = 'verified';
      }
    } else {
      status = 'verified';
    }
  } else if (input.source === 'ai_generated') {
    status = 'verified';
  } else if (input.source === 'user_uploaded' || input.source === 'third_party') {
    if (!input.licenseRef && !input.attribution) {
      status = 'missing_attribution';
      violations.push({
        violationId: generateId('img_viol'),
        workspaceId: input.workspaceId,
        userId: null,
        policyName: 'image_rights_attribution',
        severity: 'moderate',
        description: 'Image missing required attribution or license reference.',
        source: 'image-rights.checker',
        evidence: ['missing_attribution'],
        detectedAt: new Date(nowMs).toISOString(),
        resolvedAt: null,
      });
    } else {
      status = 'verified';
    }
  } else if (input.source === 'commissioned') {
    if (!input.licenseRef) {
      status = 'missing_attribution';
      violations.push({
        violationId: generateId('img_viol'),
        workspaceId: input.workspaceId,
        userId: null,
        policyName: 'image_rights_commission',
        severity: 'minor',
        description: 'Commissioned work without documented rights transfer.',
        source: 'image-rights.checker',
        evidence: ['missing_commission_contract'],
        detectedAt: new Date(nowMs).toISOString(),
        resolvedAt: null,
      });
    } else {
      status = 'verified';
    }
  }

  const valid = status === 'verified' && violations.length === 0;

  return {
    valid,
    record: {
      imageId: generateId('img'),
      workspaceId: input.workspaceId,
      source: input.source,
      status,
      url: input.imageUrl,
      licenseRef: input.licenseRef,
      attribution: input.attribution,
      licensee: input.licensee,
      expiresAt: input.expiresAt,
      verifiedAt: status === 'verified' ? new Date(nowMs).toISOString() : null,
      createdAt: new Date(nowMs).toISOString(),
    },
    violations,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
