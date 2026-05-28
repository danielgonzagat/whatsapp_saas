import {
  buildSendBodyFromApproval,
  mapLiveFeedMessage,
  normalizeApprovalRequestId,
  parseApprovalRecipients,
  validateDirectEmailSendBody,
} from './marketing.controller.helpers';

describe('marketing.controller.helpers (live feed + email approval)', () => {
  describe('mapLiveFeedMessage', () => {
    const now = new Date('2026-05-28T11:30:00Z');

    it('defaults channel to WHATSAPP and contactName to Unknown when joins are absent', () => {
      const mapped = mapLiveFeedMessage({
        id: 'm-1',
        content: 'hi',
        direction: 'INBOUND',
        type: 'TEXT',
        status: 'DELIVERED',
        createdAt: now,
      });
      expect(mapped).toEqual({
        id: 'm-1',
        content: 'hi',
        direction: 'INBOUND',
        type: 'TEXT',
        channel: 'WHATSAPP',
        contactName: 'Unknown',
        createdAt: now,
        status: 'DELIVERED',
      });
    });

    it('prefers contact.name over contact.phone', () => {
      const mapped = mapLiveFeedMessage({
        id: 'm-2',
        content: 'hi',
        direction: 'INBOUND',
        type: 'TEXT',
        status: null,
        createdAt: now,
        contact: { name: 'Ada Lovelace', phone: '+5511999999999' },
        conversation: { channel: 'EMAIL' },
      });
      expect(mapped.contactName).toBe('Ada Lovelace');
      expect(mapped.channel).toBe('EMAIL');
    });

    it('falls back to contact.phone when name is null', () => {
      const mapped = mapLiveFeedMessage({
        id: 'm-3',
        content: null,
        direction: 'OUTBOUND',
        type: 'TEXT',
        status: 'SENT',
        createdAt: now,
        contact: { name: null, phone: '+5511888888888' },
        conversation: { channel: 'INSTAGRAM' },
      });
      expect(mapped.contactName).toBe('+5511888888888');
      expect(mapped.channel).toBe('INSTAGRAM');
    });

    it('passes through content and status verbatim including nulls', () => {
      const mapped = mapLiveFeedMessage({
        id: 'm-4',
        content: null,
        direction: 'INBOUND',
        type: 'AUDIO',
        status: null,
        createdAt: now,
      });
      expect(mapped.content).toBeNull();
      expect(mapped.status).toBeNull();
    });
  });

  describe('validateDirectEmailSendBody', () => {
    it('returns subject/html/recipients when body is empty', () => {
      expect(validateDirectEmailSendBody({})).toEqual(['subject', 'html', 'recipients']);
    });

    it('reports recipients when the array is empty', () => {
      expect(
        validateDirectEmailSendBody({
          subject: 's',
          html: '<p>hi</p>',
          recipients: [],
        }),
      ).toEqual(['recipients']);
    });

    it('returns an empty list when the body is valid', () => {
      expect(
        validateDirectEmailSendBody({
          subject: 's',
          html: '<p>hi</p>',
          recipients: [{ email: 'a@b.com' }],
        }),
      ).toEqual([]);
    });
  });

  describe('parseApprovalRecipients', () => {
    it('returns an empty array when recipients is missing or not an array', () => {
      expect(parseApprovalRecipients({})).toEqual([]);
      expect(parseApprovalRecipients({ recipients: 'nope' })).toEqual([]);
      expect(parseApprovalRecipients({ recipients: null })).toEqual([]);
    });

    it('skips non-object entries and entries without an email', () => {
      const result = parseApprovalRecipients({
        recipients: [
          null,
          'string',
          { email: '' },
          { email: 'ok@ex.com' },
          { email: 'b@ex.com', name: 'B' },
        ],
      });
      expect(result).toEqual([
        { email: 'ok@ex.com' },
        { email: 'b@ex.com', name: 'B' },
      ]);
    });

    it('only attaches name when it is a string', () => {
      const result = parseApprovalRecipients({
        recipients: [
          { email: 'x@ex.com', name: 42 },
          { email: 'y@ex.com', name: 'Y' },
        ],
      });
      expect(result).toEqual([{ email: 'x@ex.com' }, { email: 'y@ex.com', name: 'Y' }]);
    });
  });

  describe('buildSendBodyFromApproval', () => {
    it('returns just an empty recipient list when the payload is empty', () => {
      expect(buildSendBodyFromApproval({})).toEqual({ recipients: [] });
    });

    it('hydrates subject/html/campaignName when present as strings', () => {
      const body = buildSendBodyFromApproval({
        recipients: [{ email: 'a@b.com', name: 'A' }],
        subject: 'hello',
        html: '<p>hi</p>',
        campaignName: 'spring-2026',
      });
      expect(body).toEqual({
        recipients: [{ email: 'a@b.com', name: 'A' }],
        subject: 'hello',
        html: '<p>hi</p>',
        campaignName: 'spring-2026',
      });
    });

    it('drops non-string subject/html/campaignName fields', () => {
      const body = buildSendBodyFromApproval({
        recipients: [{ email: 'a@b.com' }],
        subject: 42,
        html: null,
        campaignName: { x: 1 },
      });
      expect(body).toEqual({
        recipients: [{ email: 'a@b.com' }],
      });
    });
  });

  describe('normalizeApprovalRequestId', () => {
    it('returns trimmed string when value is a string', () => {
      expect(normalizeApprovalRequestId('   abc   ')).toBe('abc');
      expect(normalizeApprovalRequestId('abc')).toBe('abc');
    });

    it('returns empty string for non-string values', () => {
      expect(normalizeApprovalRequestId(undefined)).toBe('');
      expect(normalizeApprovalRequestId(null)).toBe('');
      expect(normalizeApprovalRequestId(42)).toBe('');
      expect(normalizeApprovalRequestId({})).toBe('');
    });
  });
});
