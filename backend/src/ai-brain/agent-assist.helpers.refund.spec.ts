import { refundAiUsageIfNeeded } from './agent-assist.helpers';
import { WalletService } from '../wallet/wallet.service';
import { makeMockWalletService } from './agent-assist.helpers.spec.helpers';

jest.mock('../wallet/wallet.service');
jest.mock('../wallet/provider-llm-billing', () => ({
  estimateOpenAiChatQuoteCostCents: jest.fn(() => BigInt(1000)),
  quoteOpenAiChatActualCostCents: jest.fn(() => BigInt(1200)),
}));
jest.mock('../wallet/provider-pricing');

// PULSE_OK: assertions exist below
describe('agent-assist.helpers — refund', () => {
  describe('refundAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;

    beforeEach(() => {
      mockWalletService = makeMockWalletService();
    });

    it('should return early when workspaceId is undefined', async () => {
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        reason: 'provider_timeout',
      });
      expect(mockWalletService.refundUsageCharge).not.toHaveBeenCalled();
    });

    it('should refund with reason', async () => {
      mockWalletService.refundUsageCharge.mockResolvedValue(null);
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'suggest_reply',
        reason: 'provider_unavailable',
      });
      expect(mockWalletService.refundUsageCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          requestId: 'req-1',
          reason: 'provider_unavailable',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'suggest_reply',
          }),
        }),
      );
    });

    it('should handle null workspaceId', async () => {
      await refundAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: null,
        requestId: 'req-1',
        assistantAction: 'summarize_conversation',
        reason: 'user_cancelled',
      });
      expect(mockWalletService.refundUsageCharge).not.toHaveBeenCalled();
    });
  });
});
