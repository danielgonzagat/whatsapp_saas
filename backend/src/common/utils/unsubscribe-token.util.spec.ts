import { generateUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.util';

describe('UnsubscribeToken', () => {
  const email = 'test@kloel.com';

  it('should generate a token that verifies to the same email', () => {
    const token = generateUnsubscribeToken({ email });
    const payload = verifyUnsubscribeToken(token);
    expect(payload).not.toBeNull();
    expect(payload.email).toBe(email);
  });

  it('should reject a tampered token', () => {
    const token = generateUnsubscribeToken({ email });
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('should reject an empty string', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
  });

  it('should reject a random string', () => {
    expect(verifyUnsubscribeToken('not.a.valid.token')).toBeNull();
  });

  it('should include optional workspaceId and campaignId', () => {
    const token = generateUnsubscribeToken({ email, workspaceId: 'ws-1', campaignId: 'cid-1' });
    const payload = verifyUnsubscribeToken(token);
    expect(payload).not.toBeNull();
    expect(payload.email).toBe(email);
    expect(payload.workspaceId).toBe('ws-1');
    expect(payload.campaignId).toBe('cid-1');
  });
});
