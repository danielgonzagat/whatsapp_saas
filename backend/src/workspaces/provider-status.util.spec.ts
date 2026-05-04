import {
  pickWahaQrCode,
  pickMetaAuthUrl,
  resolveRawStatusFallback,
  resolveSelfIds,
  resolveSessionName,
  resolveWhatsappBusinessId,
  resolveDisconnectReason,
  buildProviderSessionSnapshot,
} from './provider-status.util';

describe('pickWahaQrCode', () => {
  it('returns qrCode string for whatsapp-api', () => {
    expect(pickWahaQrCode('whatsapp-api', 'qr-data')).toBe('qr-data');
  });

  it('returns null for meta-cloud', () => {
    expect(pickWahaQrCode('meta-cloud', 'qr-data')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(pickWahaQrCode('whatsapp-api', 123)).toBeNull();
    expect(pickWahaQrCode('whatsapp-api', null)).toBeNull();
    expect(pickWahaQrCode('whatsapp-api', {})).toBeNull();
  });

  it('returns null for empty/whitespace strings', () => {
    expect(pickWahaQrCode('whatsapp-api', '')).toBeNull();
    expect(pickWahaQrCode('whatsapp-api', '   ')).toBeNull();
  });
});

describe('pickMetaAuthUrl', () => {
  it('returns authUrl string for meta-cloud', () => {
    expect(pickMetaAuthUrl('meta-cloud', 'https://auth.url')).toBe('https://auth.url');
  });

  it('returns null for whatsapp-api', () => {
    expect(pickMetaAuthUrl('whatsapp-api', 'https://auth.url')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(pickMetaAuthUrl('meta-cloud', 123)).toBeNull();
    expect(pickMetaAuthUrl('meta-cloud', null)).toBeNull();
  });

  it('returns null for empty/whitespace strings', () => {
    expect(pickMetaAuthUrl('meta-cloud', '')).toBeNull();
    expect(pickMetaAuthUrl('meta-cloud', '   ')).toBeNull();
  });
});

describe('resolveRawStatusFallback', () => {
  it('returns existing rawStatus when present', () => {
    expect(resolveRawStatusFallback('CONNECTED', 'meta-cloud', 'connected', '123')).toBe(
      'CONNECTED',
    );
  });

  it('returns CONNECTED when normalizedStatus is connected', () => {
    expect(resolveRawStatusFallback('', 'meta-cloud', 'connected', '123')).toBe('CONNECTED');
  });

  it('falls back to meta fallback for meta-cloud with phoneNumberId', () => {
    expect(resolveRawStatusFallback('', 'meta-cloud', 'disconnected', '123')).toBe(
      'CONNECTION_INCOMPLETE',
    );
  });

  it('falls back to meta fallback for meta-cloud without phoneNumberId', () => {
    expect(resolveRawStatusFallback('', 'meta-cloud', 'disconnected', null)).toBe('DISCONNECTED');
  });

  it('falls back to waha fallback for whatsapp-api connecting', () => {
    expect(resolveRawStatusFallback('', 'whatsapp-api', 'connecting', null)).toBe('SCAN_QR_CODE');
  });

  it('falls back to waha fallback for whatsapp-api disconnected', () => {
    expect(resolveRawStatusFallback('', 'whatsapp-api', 'disconnected', null)).toBe('DISCONNECTED');
  });
});

describe('resolveSelfIds', () => {
  it('returns the array when valid', () => {
    expect(resolveSelfIds(['id1', 'id2'])).toEqual(['id1', 'id2']);
  });

  it('returns empty array for null', () => {
    expect(resolveSelfIds(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(resolveSelfIds(undefined)).toEqual([]);
  });
});

describe('resolveSessionName', () => {
  it('returns sessionName when present', () => {
    expect(resolveSessionName('my-session', 'ws-123')).toBe('my-session');
  });

  it('falls back to workspaceId when sessionName is empty', () => {
    expect(resolveSessionName('', 'ws-123')).toBe('ws-123');
  });

  it('falls back to workspaceId when sessionName is null', () => {
    expect(resolveSessionName(null, 'ws-456')).toBe('ws-456');
  });
});

describe('resolveWhatsappBusinessId', () => {
  it('returns businessId for meta-cloud', () => {
    expect(resolveWhatsappBusinessId('meta-cloud', 'biz-123')).toBe('biz-123');
  });

  it('returns null for whatsapp-api', () => {
    expect(resolveWhatsappBusinessId('whatsapp-api', 'biz-123')).toBeNull();
  });

  it('returns null when businessId is null', () => {
    expect(resolveWhatsappBusinessId('meta-cloud', null)).toBeNull();
  });
});

describe('resolveDisconnectReason', () => {
  it('returns null when connected', () => {
    expect(resolveDisconnectReason('connected', 'some-reason')).toBeNull();
  });

  it('returns the reason when not connected', () => {
    expect(resolveDisconnectReason('disconnected', 'some-reason')).toBe('some-reason');
  });

  it('returns reason for failed status', () => {
    expect(resolveDisconnectReason('failed', 'session-expired')).toBe('session-expired');
  });
});

describe('buildProviderSessionSnapshot', () => {
  const baseParams = {
    providerType: 'meta-cloud' as const,
    session: {
      qrCode: 'qr-data',
      status: 'DISCONNECTED',
      authUrl: 'https://auth.meta.com',
      selfIds: ['self1'],
      pushName: 'Test Push',
      phoneNumber: '+123456789',
      phoneNumberId: null,
      connectedAt: null,
      lastUpdated: null,
      sessionName: null,
      disconnectReason: '',
      whatsappBusinessId: null,
      rawStatus: '',
      provider: 'meta-cloud',
    } as unknown as Record<string, unknown>,
    rawStatus: '',
    normalizedStatus: 'disconnected' as const,
    phoneNumberId: null as string | null,
    disconnectReason: 'test_reason',
    workspaceId: 'ws-123',
  };

  it('builds a complete snapshot with correct fields', () => {
    const snapshot = buildProviderSessionSnapshot(baseParams);

    expect(snapshot.provider).toBe('meta-cloud');
    expect(snapshot.status).toBe('disconnected');
    expect(snapshot.selfIds).toEqual(['self1']);
    expect(snapshot.pushName).toBe('Test Push');
    expect(snapshot.phoneNumber).toBe('+123456789');
    expect(snapshot.sessionName).toBe('ws-123');
    expect(snapshot.disconnectReason).toBe('test_reason');
    expect(snapshot.qrCode).toBeNull();
    expect(snapshot.authUrl).toBe('https://auth.meta.com');
    expect(snapshot.whatsappBusinessId).toBeNull();
    expect(snapshot.phoneNumberId).toBeNull();
  });

  it('includes qrCode for whatsapp-api provider', () => {
    const params = {
      ...baseParams,
      providerType: 'whatsapp-api' as const,
      session: { ...baseParams.session, qrCode: 'qr-code-string' },
    };
    const snapshot = buildProviderSessionSnapshot(params);
    expect(snapshot.qrCode).toBe('qr-code-string');
  });

  it('resolves sessionName from workspaceId when sessionName is null', () => {
    const snapshot = buildProviderSessionSnapshot(baseParams);
    expect(snapshot.sessionName).toBe('ws-123');
  });

  it('returns null disconnectReason when connected', () => {
    const params = {
      ...baseParams,
      normalizedStatus: 'connected' as const,
      disconnectReason: 'some-reason',
    };
    const snapshot = buildProviderSessionSnapshot(params);
    expect(snapshot.disconnectReason).toBeNull();
  });
});
