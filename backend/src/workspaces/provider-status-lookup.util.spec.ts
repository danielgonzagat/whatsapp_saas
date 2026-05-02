import {
  extractRawStatus,
  extractPhoneNumberId,
  resolveWahaStatus,
  resolveMetaStatus,
  computeNormalizedStatus,
  metaDisconnectReason,
  wahaDisconnectReason,
  computeDisconnectReason,
} from './provider-status-lookup.util';

describe('extractRawStatus', () => {
  it('prefers session.rawStatus when present', () => {
    const session = { rawStatus: 'CONNECTED', status: 'DISCONNECTED' };
    const settings = { connectionStatus: 'FAILED' };
    expect(extractRawStatus(session as any, settings as any)).toBe('CONNECTED');
  });

  it('falls back to session.status', () => {
    const session = { rawStatus: '', status: 'WORKING' };
    const settings = { connectionStatus: '' };
    expect(extractRawStatus(session as any, settings as any)).toBe('WORKING');
  });

  it('falls back to settings.connectionStatus', () => {
    const session = { rawStatus: '', status: '' };
    const settings = { connectionStatus: 'connected' };
    expect(extractRawStatus(session as any, settings as any)).toBe('CONNECTED');
  });

  it('returns empty string when all empty', () => {
    const session = { rawStatus: '', status: '' };
    const settings = { connectionStatus: '' };
    expect(extractRawStatus(session as any, settings as any)).toBe('');
  });
});

describe('extractPhoneNumberId', () => {
  it('returns null for non-meta-cloud providers', () => {
    const session = { phoneNumberId: '123456789' };
    expect(extractPhoneNumberId('whatsapp-api', session as any)).toBeNull();
  });

  it('returns phoneNumberId for meta-cloud', () => {
    const session = { phoneNumberId: ' 123456789 ' };
    expect(extractPhoneNumberId('meta-cloud', session as any)).toBe('123456789');
  });

  it('returns null when phoneNumberId is empty for meta-cloud', () => {
    expect(extractPhoneNumberId('meta-cloud', {} as any)).toBeNull();
    expect(extractPhoneNumberId('meta-cloud', { phoneNumberId: '' } as any)).toBeNull();
  });
});

describe('resolveWahaStatus', () => {
  it.each([
    ['CONNECTED', 'connected'],
    ['WORKING', 'connected'],
    ['SCAN_QR_CODE', 'connecting'],
    ['STARTING', 'connecting'],
    ['OPENING', 'connecting'],
    ['FAILED', 'failed'],
  ])('maps %s to %s', (raw, expected) => {
    expect(resolveWahaStatus(raw)).toBe(expected);
  });

  it('returns disconnected for unknown status', () => {
    expect(resolveWahaStatus('UNKNOWN_STATUS')).toBe('disconnected');
  });

  it('returns disconnected for empty string', () => {
    expect(resolveWahaStatus('')).toBe('disconnected');
  });
});

describe('resolveMetaStatus', () => {
  it('returns connected for CONNECTED', () => {
    expect(resolveMetaStatus('CONNECTED', '123')).toBe('connected');
  });

  it('returns connected for WORKING', () => {
    expect(resolveMetaStatus('WORKING', '123')).toBe('connected');
  });

  it('returns connection_incomplete when phoneNumberId exists but not connected', () => {
    expect(resolveMetaStatus('DISCONNECTED', '123')).toBe('connection_incomplete');
  });

  it('returns disconnected when no phoneNumberId', () => {
    expect(resolveMetaStatus('DISCONNECTED', null)).toBe('disconnected');
  });
});

describe('computeNormalizedStatus', () => {
  it('delegates to resolveWahaStatus for whatsapp-api', () => {
    expect(computeNormalizedStatus('whatsapp-api', 'CONNECTED', null)).toBe('connected');
    expect(computeNormalizedStatus('whatsapp-api', 'FAILED', null)).toBe('failed');
    expect(computeNormalizedStatus('whatsapp-api', 'SCAN_QR_CODE', null)).toBe('connecting');
  });

  it('delegates to resolveMetaStatus for meta-cloud', () => {
    expect(computeNormalizedStatus('meta-cloud', 'CONNECTED', '123')).toBe('connected');
    expect(computeNormalizedStatus('meta-cloud', 'DISCONNECTED', null)).toBe('disconnected');
    expect(computeNormalizedStatus('meta-cloud', 'DISCONNECTED', '123')).toBe(
      'connection_incomplete',
    );
  });
});

describe('metaDisconnectReason', () => {
  it('returns phone_number_id_missing when phoneNumberId present', () => {
    expect(metaDisconnectReason('123')).toBe('meta_whatsapp_phone_number_id_missing');
  });

  it('returns auth_required when no phoneNumberId', () => {
    expect(metaDisconnectReason(null)).toBe('meta_auth_required');
  });
});

describe('wahaDisconnectReason', () => {
  it('returns qr_pending when connecting', () => {
    expect(wahaDisconnectReason('connecting')).toBe('waha_qr_pending');
  });

  it('returns session_failed when failed', () => {
    expect(wahaDisconnectReason('failed')).toBe('waha_session_failed');
  });

  it('returns session_disconnected for other states', () => {
    expect(wahaDisconnectReason('disconnected')).toBe('waha_session_disconnected');
    expect(wahaDisconnectReason('connected')).toBe('waha_session_disconnected');
  });
});

describe('computeDisconnectReason', () => {
  it('uses session.disconnectReason when present and non-empty', () => {
    expect(
      computeDisconnectReason(
        { disconnectReason: 'session_expired' } as any,
        'meta-cloud',
        'disconnected',
        '123',
      ),
    ).toBe('session_expired');
  });

  it('falls back to meta reason when session reason is empty', () => {
    expect(
      computeDisconnectReason({ disconnectReason: '' } as any, 'meta-cloud', 'disconnected', null),
    ).toBe('meta_auth_required');
  });

  it('falls back to waha reason for whatsapp-api', () => {
    expect(
      computeDisconnectReason({ disconnectReason: '' } as any, 'whatsapp-api', 'connecting', null),
    ).toBe('waha_qr_pending');
  });

  it('returns null when connected with no session reason', () => {
    expect(
      computeDisconnectReason({ disconnectReason: '' } as any, 'whatsapp-api', 'connected', null),
    ).toBe('waha_session_disconnected');
  });
});
