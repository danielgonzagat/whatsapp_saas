import { KycController } from './kyc.controller';

describe('KycController', () => {
  it('forwards request IP and user-agent when submitting KYC', async () => {
    const kycService = {
      submitKyc: jest.fn().mockResolvedValue({
        success: true,
        status: 'submitted',
      }),
    };
    const controller = new KycController(kycService as never);

    const result = await controller.submitKyc(
      {
        user: {
          sub: 'agent_1',
          workspaceId: 'ws_1',
        },
      } as never,
      'Mozilla/5.0',
      '203.0.113.10, 198.51.100.22',
    );

    expect(kycService.submitKyc).toHaveBeenCalledWith('agent_1', 'ws_1', {
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
    });
    expect(result).toEqual({
      success: true,
      status: 'submitted',
    });
  });
});
