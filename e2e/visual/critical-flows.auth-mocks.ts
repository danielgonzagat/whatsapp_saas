import type { Page, Route } from '@playwright/test';
import type { E2EAuthContext } from '../specs/e2e-helpers';
import {
  VISUAL_KYC_BANK_FIXTURE,
  VISUAL_KYC_DOCUMENTS_FIXTURE,
  VISUAL_KYC_FISCAL_FIXTURE,
  VISUAL_KYC_PROFILE_FIXTURE,
  VISUAL_USER_EMAIL,
  VISUAL_WORKSPACE_NAME,
} from './critical-flows.data';

const KYC_ROUTE_PATTERNS = {
  profile: /\/(?:api\/)?kyc\/profile(?:\?|$)/,
  fiscal: /\/(?:api\/)?kyc\/fiscal(?:\?|$)/,
  documents: /\/(?:api\/)?kyc\/documents(?:\?|$)/,
  bank: /\/(?:api\/)?kyc\/bank(?:\?|$)/,
  status: /\/(?:api\/)?kyc\/status(?:\?|$)/,
  completion: /\/(?:api\/)?kyc\/completion(?:\?|$)/,
};

async function fulfillJson(requestRoute: Route, body: unknown) {
  await requestRoute.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function buildWorkspaceMeFixture(workspaceId: string) {
  const workspace = { id: workspaceId, name: VISUAL_WORKSPACE_NAME };
  return {
    user: {
      id: 'e2e-user',
      email: VISUAL_USER_EMAIL,
      name: 'E2E Admin',
      workspaceId,
      role: 'OWNER',
    },
    workspaces: [workspace],
    workspace,
  };
}

export async function mockVisualAuthApis(page: Page, auth: Pick<E2EAuthContext, 'workspaceId'>) {
  await page.route('**/api/workspace/me', async (requestRoute) => {
    await fulfillJson(requestRoute, buildWorkspaceMeFixture(auth.workspaceId));
  });

  await page.route(KYC_ROUTE_PATTERNS.profile, async (requestRoute) => {
    await fulfillJson(requestRoute, VISUAL_KYC_PROFILE_FIXTURE);
  });

  await page.route(KYC_ROUTE_PATTERNS.fiscal, async (requestRoute) => {
    await fulfillJson(requestRoute, {
      ...VISUAL_KYC_FISCAL_FIXTURE,
      workspaceId: auth.workspaceId,
    });
  });

  await page.route(KYC_ROUTE_PATTERNS.documents, async (requestRoute) => {
    await fulfillJson(
      requestRoute,
      VISUAL_KYC_DOCUMENTS_FIXTURE.map((document) => ({
        ...document,
        workspaceId: auth.workspaceId,
      })),
    );
  });

  await page.route(KYC_ROUTE_PATTERNS.bank, async (requestRoute) => {
    await fulfillJson(requestRoute, {
      ...VISUAL_KYC_BANK_FIXTURE,
      workspaceId: auth.workspaceId,
    });
  });

  await page.route(KYC_ROUTE_PATTERNS.status, async (requestRoute) => {
    await fulfillJson(requestRoute, {
      kycStatus: 'approved',
    });
  });

  await page.route(KYC_ROUTE_PATTERNS.completion, async (requestRoute) => {
    await fulfillJson(requestRoute, {
      percentage: 100,
    });
  });
}
