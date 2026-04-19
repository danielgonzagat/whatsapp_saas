import { describe, expect, it } from 'vitest';

import { POST as POSTAction } from './action/route';
import { POST as POSTActionTurn } from './action-turn/route';
import { POST as POSTClaim } from './claim/route';
import { POST as POSTLink } from './link/route';
import { POST as POSTPauseAgent } from './pause-agent/route';
import { GET as GETQr } from './qr/route';
import { POST as POSTResumeAgent } from './resume-agent/route';
import { POST as POSTStreamToken } from './stream-token/route';
import { POST as POSTTakeover } from './takeover/route';
import { GET as GETView } from './view/route';

async function expectLegacyGone(
  responsePromise: Promise<Response>,
  feature: string,
  _method: 'GET' | 'POST',
) {
  const response = await responsePromise;
  const body = (await response.json()) as {
    statusCode: number;
    success: boolean;
    provider: string;
    feature: string;
    notSupported: boolean;
    reason: string;
    message: string;
  };

  expect(response.status).toBe(410);
  expect(body).toMatchObject({
    statusCode: 410,
    success: false,
    provider: 'meta-cloud',
    feature,
    notSupported: true,
    reason: `${feature}_not_supported_for_meta_cloud`,
  });
  expect(body.message).toContain('Descontinuado');
  expect(body.message).toContain('integração Meta');
  expect(response.headers.get('content-type')).toContain('application/json');
}

describe('legacy WhatsApp session routes', () => {
  it('returns 410 Gone for the deprecated qr route', async () => {
    await expectLegacyGone(GETQr(), 'qr_code', 'GET');
  });

  it('returns 410 Gone for the deprecated view route', async () => {
    await expectLegacyGone(GETView(), 'viewer', 'GET');
  });

  it('returns 410 Gone for the deprecated legacy session routes', async () => {
    await expectLegacyGone(POSTLink(), 'legacy_session_link', 'POST');
    await expectLegacyGone(POSTClaim(), 'legacy_session_claim', 'POST');
    await expectLegacyGone(POSTAction(), 'viewer_action', 'POST');
    await expectLegacyGone(POSTActionTurn(), 'viewer_action_turn', 'POST');
    await expectLegacyGone(POSTTakeover(), 'viewer_takeover', 'POST');
    await expectLegacyGone(POSTResumeAgent(), 'viewer_resume_agent', 'POST');
    await expectLegacyGone(POSTPauseAgent(), 'viewer_pause_agent', 'POST');
    await expectLegacyGone(POSTStreamToken(), 'viewer_stream', 'POST');
  });
});
