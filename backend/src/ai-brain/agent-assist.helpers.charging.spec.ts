import {
  AgentAssistWalletAccessError,
  chargeAiUsageIfNeeded,
  settleAiUsageIfNeeded,
} from './agent-assist.helpers';
import { WalletService } from '../wallet/wallet.service';
import {
  InsufficientWalletBalanceError,
  UsagePriceNotFoundError,
  WalletNotFoundError,
} from '../wallet/wallet.types';
import { UnknownProviderPricingModelError } from '../wallet/provider-pricing';
import * as providerLlmBilling from '../wallet/provider-llm-billing';
import { makeChargeUsageResult, makeMockWalletService } from './agent-assist.helpers.spec.helpers';

jest.mock('../wallet/wallet.service');
jest.mock('../wallet/provider-llm-billing', () => ({
  estimateOpenAiChatQuoteCostCents: jest.fn(() => BigInt(1000)),
  quoteOpenAiChatActualCostCents: jest.fn(() => BigInt(1200)),
}));
jest.mock('../wallet/provider-pricing');

const quoteOpenAiChatActualCostCentsMock =
  providerLlmBilling.quoteOpenAiChatActualCostCents as jest.MockedFunction<
    typeof providerLlmBilling.quoteOpenAiChatActualCostCents
  >;

describe('agent-assist.helpers — charging', () => {
  describe('chargeAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;

    beforeEach(() => {
      mockWalletService = makeMockWalletService();
    });

    it('should return false when workspaceId is undefined', async () => {
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: {},
      });
      expect(result).toBe(false);
      expect(mockWalletService.chargeForUsage).not.toHaveBeenCalled();
    });

    it('should return false when workspaceId is null', async () => {
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: null,
        requestId: 'req-1',
        assistantAction: 'generate_pitch',
        metadata: {},
      });
      expect(result).toBe(false);
    });

    it('should charge with estimated cost when provided', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue(makeChargeUsageResult());
      await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: { test: true },
        estimatedCostCents: BigInt(1500),
      });
      expect(mockWalletService.chargeForUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          quotedCostCents: BigInt(1500),
          requestId: 'req-1',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'analyze_sentiment',
            test: true,
          }),
        }),
      );
    });

    it('should charge with units=1 when no estimated cost', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue(makeChargeUsageResult());
      await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'suggest_reply',
        metadata: {},
      });
      expect(mockWalletService.chargeForUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          units: 1,
        }),
      );
    });

    it('should return true on successful charge', async () => {
      mockWalletService.chargeForUsage.mockResolvedValue(makeChargeUsageResult());
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'summarize_conversation',
        metadata: {},
      });
      expect(result).toBe(true);
    });

    it('should return false on UsagePriceNotFoundError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(new UsagePriceNotFoundError('ai_message'));
      const result = await chargeAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        metadata: {},
      });
      expect(result).toBe(false);
    });

    it('should throw AgentAssistWalletAccessError on InsufficientWalletBalanceError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(
        new InsufficientWalletBalanceError('wallet-1', BigInt(5000), BigInt(1000)),
      );
      await expect(
        chargeAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(AgentAssistWalletAccessError);
    });

    it('should throw AgentAssistWalletAccessError on WalletNotFoundError', async () => {
      mockWalletService.chargeForUsage.mockRejectedValue(new WalletNotFoundError('ws-1'));
      await expect(
        chargeAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          metadata: {},
        }),
      ).rejects.toBeInstanceOf(AgentAssistWalletAccessError);
    });
  });

  describe('settleAiUsageIfNeeded', () => {
    let mockWalletService: jest.Mocked<WalletService>;

    beforeEach(() => {
      mockWalletService = makeMockWalletService();
      quoteOpenAiChatActualCostCentsMock.mockReturnValue(BigInt(1200));
    });

    it('should return early when workspaceId is undefined', async () => {
      await settleAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: undefined,
        requestId: 'req-1',
        assistantAction: 'analyze_sentiment',
        model: 'gpt-4',
        usage: { completion_tokens: 10, prompt_tokens: 5 },
      });
      expect(mockWalletService.settleUsageCharge).not.toHaveBeenCalled();
    });

    it('should settle with actual cost calculation', async () => {
      mockWalletService.settleUsageCharge.mockResolvedValue(null);
      await settleAiUsageIfNeeded({
        walletService: mockWalletService,
        workspaceId: 'ws-1',
        requestId: 'req-1',
        assistantAction: 'generate_pitch',
        model: 'gpt-4',
        usage: { completion_tokens: 20, prompt_tokens: 10 },
      });
      expect(mockWalletService.settleUsageCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          operation: 'ai_message',
          requestId: 'req-1',
          actualCostCents: BigInt(1200),
          reason: 'ai_assistant_provider_usage',
          metadata: expect.objectContaining({
            channel: 'ai_assistant',
            capability: 'generate_pitch',
            model: 'gpt-4',
          }),
        }),
      );
    });

    it('should silently catch UnknownProviderPricingModelError', async () => {
      mockWalletService.settleUsageCharge.mockRejectedValue(
        new UnknownProviderPricingModelError('unknown model'),
      );
      await expect(
        settleAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          model: 'unknown',
          usage: {},
        }),
      ).resolves.not.toThrow();
    });

    it('should rethrow non-pricing errors', async () => {
      mockWalletService.settleUsageCharge.mockRejectedValue(new Error('db error'));
      await expect(
        settleAiUsageIfNeeded({
          walletService: mockWalletService,
          workspaceId: 'ws-1',
          requestId: 'req-1',
          assistantAction: 'analyze_sentiment',
          model: 'gpt-4',
          usage: {},
        }),
      ).rejects.toThrow('db error');
    });
  });
});
