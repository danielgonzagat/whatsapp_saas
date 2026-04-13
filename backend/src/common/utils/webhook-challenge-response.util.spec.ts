import type { Response } from 'express';
import { sanitizeWebhookChallenge, sendPlainTextResponse } from './webhook-challenge-response.util';

describe('webhook-challenge-response.util', () => {
  it('accepts only safe verification challenges', () => {
    expect(sanitizeWebhookChallenge(' challenge_123-OK ')).toBe('challenge_123-OK');
    expect(sanitizeWebhookChallenge('<svg/onload=alert(1)>')).toBeNull();
  });

  it('writes webhook challenges as plain text with nosniff', () => {
    const status = jest.fn().mockReturnThis();
    const setHeader = jest.fn();
    const end = jest.fn();
    const res = { status, setHeader, end } as unknown as Response;

    const returned = sendPlainTextResponse(res, 'challenge-token');

    expect(returned).toBe(res);
    expect(status).toHaveBeenCalledWith(200);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(end).toHaveBeenCalledWith('challenge-token', 'utf8');
  });
});
