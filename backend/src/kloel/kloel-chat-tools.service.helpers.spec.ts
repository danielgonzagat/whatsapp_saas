import {
  buildBlockedConfigurationTool,
  buildCreateFlowBlocker,
  buildSendChannelMessageBlocker,
  buildUploadPlanImageBlocker,
  centsFromUnknown,
  coerceAnalyticsArgs,
  coerceCouponArgs,
  coerceWarrantyArgs,
} from './kloel-chat-tools.service.helpers';

describe('kloel-chat-tools.service.helpers', () => {
  describe('centsFromUnknown', () => {
    it('returns Number for bigint inputs', () => {
      expect(centsFromUnknown(BigInt(12345))).toBe(12345);
    });

    it('truncates finite numbers toward zero', () => {
      expect(centsFromUnknown(99.9)).toBe(99);
      expect(centsFromUnknown(-1.7)).toBe(-1);
      expect(centsFromUnknown(0)).toBe(0);
    });

    it('returns 0 for NaN, Infinity, strings, undefined, null, objects', () => {
      expect(centsFromUnknown(Number.NaN)).toBe(0);
      expect(centsFromUnknown(Number.POSITIVE_INFINITY)).toBe(0);
      expect(centsFromUnknown(Number.NEGATIVE_INFINITY)).toBe(0);
      expect(centsFromUnknown('123')).toBe(0);
      expect(centsFromUnknown(undefined)).toBe(0);
      expect(centsFromUnknown(null)).toBe(0);
      expect(centsFromUnknown({ value: 1 })).toBe(0);
    });
  });

  describe('buildBlockedConfigurationTool', () => {
    it('builds a ToolResult with the expected portuguese message', () => {
      const result = buildBlockedConfigurationTool(
        'toolConfigurePixel',
        'pixel_configuration_service_required',
        'PixelService.configure',
      );
      expect(result).toEqual({
        success: false,
        error: 'pixel_configuration_service_required',
        message:
          'toolConfigurePixel exige PixelService.configure antes de poder declarar configuracao feita.',
      });
    });
  });

  describe('buildCreateFlowBlocker', () => {
    it('emits flow_service_required block', () => {
      expect(buildCreateFlowBlocker()).toEqual({
        success: false,
        error: 'flow_service_required',
        message:
          'create_flow exige FlowsService.create ou service equivalente antes de declarar fluxo criado.',
      });
    });
  });

  describe('buildSendChannelMessageBlocker', () => {
    it('emits channel_service_required block', () => {
      expect(buildSendChannelMessageBlocker()).toEqual({
        success: false,
        error: 'channel_service_required',
        message:
          'send_channel_message must execute through a real channel service before it can report delivery.',
      });
    });
  });

  describe('buildUploadPlanImageBlocker', () => {
    it('blocks with image_url_required when imageUrl is missing', () => {
      const result = buildUploadPlanImageBlocker({});
      expect(result.success).toBe(false);
      expect(result.error).toBe('image_url_required');
    });

    it('blocks with image_url_required when imageUrl is not a string', () => {
      const result = buildUploadPlanImageBlocker({ imageUrl: 42 });
      expect(result.error).toBe('image_url_required');
    });

    it('asks for plan/product name when imageUrl present but no identifier', () => {
      const result = buildUploadPlanImageBlocker({ imageUrl: 'https://cdn/x.png' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Informe o nome do plano ou do produto.');
    });

    it('falls through to plan_image_service_required when planName is provided', () => {
      const result = buildUploadPlanImageBlocker({
        imageUrl: 'https://cdn/x.png',
        planName: 'Gold',
      });
      expect(result.error).toBe('plan_image_service_required');
    });

    it('falls through to plan_image_service_required when productName is provided', () => {
      const result = buildUploadPlanImageBlocker({
        imageUrl: 'https://cdn/x.png',
        productName: 'Curso',
      });
      expect(result.error).toBe('plan_image_service_required');
    });
  });

  describe('coerceCouponArgs', () => {
    it('trims string productId and code', () => {
      expect(coerceCouponArgs({ productId: '  p-1 ', code: '  ABC ' })).toEqual({
        productId: 'p-1',
        code: 'ABC',
      });
    });

    it('returns empty strings for non-string inputs', () => {
      expect(coerceCouponArgs({ productId: 42, code: null })).toEqual({
        productId: '',
        code: '',
      });
    });

    it('returns empty strings when args are absent', () => {
      expect(coerceCouponArgs({})).toEqual({ productId: '', code: '' });
    });
  });

  describe('coerceAnalyticsArgs', () => {
    it('defaults metric to overview when missing', () => {
      expect(coerceAnalyticsArgs({})).toEqual({ metric: 'overview' });
    });

    it('defaults metric to overview when whitespace-only', () => {
      expect(coerceAnalyticsArgs({ metric: '   ' })).toEqual({ metric: 'overview' });
    });

    it('trims metric and forwards period when present', () => {
      expect(coerceAnalyticsArgs({ metric: ' revenue ', period: ' 30d ' })).toEqual({
        metric: 'revenue',
        period: '30d',
      });
    });

    it('omits period when blank string', () => {
      expect(coerceAnalyticsArgs({ metric: 'revenue', period: '   ' })).toEqual({
        metric: 'revenue',
      });
    });

    it('omits period when non-string', () => {
      expect(coerceAnalyticsArgs({ metric: 'revenue', period: 7 })).toEqual({
        metric: 'revenue',
      });
    });
  });

  describe('coerceWarrantyArgs', () => {
    it('returns null when productName is missing', () => {
      expect(coerceWarrantyArgs({})).toBeNull();
      expect(coerceWarrantyArgs({ productName: '' })).toBeNull();
      expect(coerceWarrantyArgs({ productName: 42 })).toBeNull();
    });

    it('defaults warrantyDays to 7 when missing or non-number', () => {
      expect(coerceWarrantyArgs({ productName: 'Curso' })).toEqual({
        productName: 'Curso',
        warrantyDays: 7,
      });
      expect(coerceWarrantyArgs({ productName: 'Curso', warrantyDays: '30' })).toEqual({
        productName: 'Curso',
        warrantyDays: 7,
      });
    });

    it('forwards numeric warrantyDays', () => {
      expect(coerceWarrantyArgs({ productName: 'Curso', warrantyDays: 30 })).toEqual({
        productName: 'Curso',
        warrantyDays: 30,
      });
    });
  });
});
