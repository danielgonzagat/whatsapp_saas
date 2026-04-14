import type { Page } from '@playwright/test';
import type { E2EAuthContext } from '../specs/e2e-helpers';
import {
  VISUAL_KYC_BANK_FIXTURE,
  VISUAL_KYC_DOCUMENTS_FIXTURE,
  VISUAL_KYC_FISCAL_FIXTURE,
  VISUAL_KYC_PROFILE_FIXTURE,
  VISUAL_USER_EMAIL,
  VISUAL_WORKSPACE_NAME,
} from './critical-flows.data';

export async function mockVisualAuthApis(page: Page, auth: Pick<E2EAuthContext, 'workspaceId'>) {
  await page.route('**/api/workspace/me', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'e2e-user',
          email: VISUAL_USER_EMAIL,
          name: 'E2E Admin',
          workspaceId: auth.workspaceId,
          role: 'OWNER',
        },
        workspaces: [
          {
            id: auth.workspaceId,
            name: VISUAL_WORKSPACE_NAME,
          },
        ],
        workspace: {
          id: auth.workspaceId,
          name: VISUAL_WORKSPACE_NAME,
        },
      }),
    });
  });

  await page.route('**/api/kyc/profile', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VISUAL_KYC_PROFILE_FIXTURE),
    });
  });

  await page.route('**/api/kyc/fiscal', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...VISUAL_KYC_FISCAL_FIXTURE,
        workspaceId: auth.workspaceId,
      }),
    });
  });

  await page.route('**/api/kyc/documents', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        VISUAL_KYC_DOCUMENTS_FIXTURE.map((document) => ({
          ...document,
          workspaceId: auth.workspaceId,
        })),
      ),
    });
  });

  await page.route('**/api/kyc/bank', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...VISUAL_KYC_BANK_FIXTURE,
        workspaceId: auth.workspaceId,
      }),
    });
  });

  await page.route('**/api/kyc/status', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kycStatus: 'approved',
      }),
    });
  });

  await page.route('**/api/kyc/completion', async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        percentage: 100,
      }),
    });
  });
}
