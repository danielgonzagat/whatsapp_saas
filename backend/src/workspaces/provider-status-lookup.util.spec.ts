import {
  extractRawStatus,
  extractPhoneNumberId,
  resolveMetaStatus,
  computeNormalizedStatus,
  metaDisconnectReason,
  computeDisconnectReason,
} from './provider-status-lookup.util';

describe('extractRawStatus', () => {
  it('prefers session.rawStatus when present', () => {
    const session = { rawStatus: 'CONNECTED', status: 'DISCONNECTED' };
    const settings = { connectionStatus: 'FAILED' };
    expect(
      extractRawStatus(session as Record<string, unknown>, settings as Record<string, unknown>),
    ).toBe('CONNECTED');
  });

  it('falls back to session.status', () => {
    const session = { rawStatus: '', status: 'WORKING' };
    const settings = { connectionStatus: '' };
    expect(
      extractRawStatus(session as Record<string, unknown>, settings as Record<string, unknown>),
    ).toBe('WORKING');
  });

  it('falls back to settings.connectionStatus', () => {
    const session = { rawStatus: '', status: '' };
    const settings = { connectionStatus: 'connected' };
    expect(
      extractRawStatus(session as Record<string, unknown>, settings as Record<string, unknown>),
    ).toBe('CONNECTED');
  });

  it('returns empty string when all empty', () => {
    const session = { rawStatus: '', status: '' };
    const settings = { connectionStatus: '' };
    expect(
      extractRawStatus(session as Record<string, unknown>, settings as Record<string, unknown>),
    ).toBe('');
  });
});

describe('extractPhoneNumberId', () => {
  it('returns phoneNumberId for meta-cloud', () => {
    const session = { phoneNumberId: ' 123456789 ' };
    expect(extractPhoneNumberId('meta-cloud', session as Record<string, unknown>)).toBe(
      '123456789',
    );
  });

  it('returns null when phoneNumberId is empty for meta-cloud', () => {
    expect(extractPhoneNumberId('meta-cloud', {})).toBeNull();
    expect(extractPhoneNumberId('meta-cloud', { phoneNumberId: '' })).toBeNull();
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

describe('computeDisconnectReason', () => {
  it('uses session.disconnectReason when present and non-empty', () => {
    expect(
      computeDisconnectReason(
        { disconnectReason: 'session_expired' },
        'meta-cloud',
        'disconnected',
        '123',
      ),
    ).toBe('session_expired');
  });

  it('falls back to meta reason when session reason is empty', () => {
    expect(
      computeDisconnectReason({ disconnectReason: '' }, 'meta-cloud', 'disconnected', null),
    ).toBe('meta_auth_required');
  });
});
