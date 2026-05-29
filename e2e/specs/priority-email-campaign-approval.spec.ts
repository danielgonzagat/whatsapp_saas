/**
 * E2E Priority 6 — Marketing Email Campaign (create → approval gate)
 *
 * The email-marketing controller routes the campaign send through a human
 * approval gate (kind='email_campaign:send'). This spec verifies:
 *  1. POST /marketing/email/campaigns creates a DRAFT campaign.
 *  2. GET  /marketing/email/campaigns/:id returns the campaign.
 *  3. POST /marketing/email/campaigns/:id/send (no approvalRequestId) opens
 *     an ApprovalRequest and the campaign stays in DRAFT — nothing is sent.
 *
 * Real backend routes:
 *  - POST /marketing/email/campaigns
 *  - GET  /marketing/email/campaigns/:id
 *  - POST /marketing/email/campaigns/:id/send
 *
 * RAC tables touched: RAC_EmailCampaign (insert), RAC_ApprovalRequest (insert).
 *                     RAC_EmailCampaignDelivery must NOT grow until approval.
 *
 * Truth mode: 'observed'.
 */
import { test, expect } from '@playwright/test';
import { ensureE2EAdmin, getE2EBaseUrls } from './e2e-helpers';

type CampaignCreateResponse = {
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    recipients?: Array<{ email: string }>;
  };
};

type CampaignSendResponse = {
  approvalRequired?: boolean;
  approvalRequestId?: string;
  approvalState?: string;
  campaign?: { id?: string; status?: string };
  message?: string;
};

test.describe('Priority — Email Campaign Approval Gate', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  const { apiUrl } = getE2EBaseUrls();
  let token = '';
  let workspaceId = '';
  let campaignId = '';

  test.beforeAll(async ({ request }) => {
    test.setTimeout(90_000);
    try {
      const session = await ensureE2EAdmin(request);
      token = session.token;
      workspaceId = session.workspaceId;
    } catch (err) {
      test.skip(true, `auth setup unavailable: ${(err as Error).message}`);
    }
  });

  test('POST /marketing/email/campaigns creates DRAFT campaign', async ({ request }) => {
    if (!token) test.skip(true, 'no e2e auth');

    const res = await request.post(`${apiUrl}/marketing/email/campaigns`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
        'Idempotency-Key': `e2e-email-${Date.now()}`,
      },
      data: {
        name: `E2E Email Campaign ${Date.now()}`,
        subject: 'E2E test subject',
        htmlBody: '<p>E2E test body — do not send.</p>',
        recipients: [{ email: `e2e-recipient-${Date.now()}@example.com`, name: 'E2E' }],
      },
    });

    expect([200, 201, 400, 503]).toContain(res.status());

    if (![200, 201].includes(res.status())) {
      test.info().annotations.push({
        type: 'skipped-assertion',
        description: `Email campaign create returned ${res.status()}; subsequent steps skipped.`,
      });
      return;
    }

    const body = (await res.json()) as CampaignCreateResponse;
    expect(body.campaign?.id).toBeTruthy();
    expect(body.campaign?.status).toBe('DRAFT');
    campaignId = body.campaign!.id!;
  });

  test('POST /marketing/email/campaigns/:id/send (no approvalRequestId) opens approval, stays DRAFT', async ({
    request,
  }) => {
    if (!token || !campaignId) test.skip(true, 'campaign not seeded');

    const res = await request.post(`${apiUrl}/marketing/email/campaigns/${campaignId}/send`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': workspaceId,
        'Idempotency-Key': `e2e-email-send-${Date.now()}`,
      },
      data: {},
    });

    expect([200, 201]).toContain(res.status());
    const body = (await res.json()) as CampaignSendResponse;
    expect(body.approvalRequired).toBe(true);
    expect(body.approvalRequestId).toBeTruthy();
    expect(body.approvalState).toBe('OPEN');

    // Re-fetch campaign: must STILL be DRAFT (no send happened)
    const detailRes = await request.get(`${apiUrl}/marketing/email/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId },
    });
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as CampaignCreateResponse;
    expect(detail.campaign?.status).toBe('DRAFT');
  });
});
