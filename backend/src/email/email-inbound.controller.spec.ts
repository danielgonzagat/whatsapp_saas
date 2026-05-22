import { EmailInboundController } from './email-inbound.controller';

describe('EmailInboundController', () => {
  let controller: EmailInboundController;
  let mockIsConfigured: jest.Mock;
  let mockGetProvider: jest.Mock;
  let mockProcessInboundEmail: jest.Mock;

  const SECRET = 'inbound-secret-123';

  beforeEach(() => {
    mockIsConfigured = jest.fn();
    mockGetProvider = jest.fn();
    mockProcessInboundEmail = jest.fn();

    controller = new EmailInboundController({
      isConfigured: mockIsConfigured,
      getProvider: mockGetProvider,
      processInboundEmail: mockProcessInboundEmail,
    } as never);

    process.env.EMAIL_INBOUND_SECRET = SECRET;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EMAIL_INBOUND_SECRET;
    delete process.env.EMAIL_INBOUND_WORKSPACE_ID;
  });

  describe('status', () => {
    it('returns configured status when service is configured', () => {
      mockIsConfigured.mockReturnValue(true);
      mockGetProvider.mockReturnValue('sendgrid');

      const result = controller.status();

      expect(mockIsConfigured).toHaveBeenCalledTimes(1);
      expect(mockGetProvider).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        configured: true,
        provider: 'sendgrid',
        message: 'Email inbound webhook is active',
        endpoint: '/api/email-inbound/receive',
      });
    });

    it('returns setup-required when not configured', () => {
      mockIsConfigured.mockReturnValue(false);
      mockGetProvider.mockReturnValue(null);

      const result = controller.status();

      expect(result.configured).toBe(false);
      expect(result.provider).toBe('none');
      expect(result.endpoint).toBeNull();
    });
  });

  describe('receive', () => {
    const validBody = {
      workspaceId: 'ws-1',
      from: 'sender@test.com',
      to: 'inbox@kloel.com',
      subject: 'Hello',
    };

    it('processes inbound email with correct args (happy path)', async () => {
      mockIsConfigured.mockReturnValue(true);
      mockProcessInboundEmail.mockResolvedValue({ status: 'saved', messageId: 'msg-1' });

      const result = await controller.receive(validBody, SECRET);

      expect(mockProcessInboundEmail).toHaveBeenCalledTimes(1);
      expect(mockProcessInboundEmail).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          from: 'sender@test.com',
          subject: 'Hello',
        }),
      );
      expect(result).toEqual({ status: 'ok', messageId: 'msg-1' });
    });

    it('returns setup_required when service is not configured', async () => {
      mockIsConfigured.mockReturnValue(false);

      const result = await controller.receive({});

      expect(mockProcessInboundEmail).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'setup_required',
        reason: expect.stringContaining('EMAIL_INBOUND_SECRET'),
      });
    });

    it('propagates error from service', async () => {
      mockIsConfigured.mockReturnValue(true);
      mockProcessInboundEmail.mockRejectedValue(new Error('Service failure'));

      const result = await controller.receive(validBody, SECRET);

      expect(result).toEqual({ status: 'error', reason: 'Service failure' });
    });

    it('propagates workspaceId into service call', async () => {
      mockIsConfigured.mockReturnValue(true);
      mockProcessInboundEmail.mockResolvedValue({ status: 'saved', messageId: 'msg-2' });

      const body = { workspaceId: 'ws-identity', from: 'user@test.com' };

      await controller.receive(body, SECRET);

      expect(mockProcessInboundEmail).toHaveBeenCalledWith(
        'ws-identity',
        expect.objectContaining({
          from: 'user@test.com',
          subject: 'Sem assunto',
          to: '',
        }),
      );
    });
  });
});
