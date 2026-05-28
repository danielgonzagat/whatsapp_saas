import {
  dispatchWorkspaceInfoTool,
  isWorkspaceInfoTool,
  WORKSPACE_INFO_TOOL_NAMES,
} from './kloel-tool-dispatcher.workspace-info.handlers';
import type { WorkspaceInfoToolDeps } from './kloel-tool-dispatcher.workspace-info.handlers';

type Stub = {
  toolListFlows: jest.Mock;
  toolGetDashboardSummary: jest.Mock;
  toolGetProductPlans: jest.Mock;
  toolGetProductAiConfig: jest.Mock;
  toolGetProductReviews: jest.Mock;
  toolGetProductUrls: jest.Mock;
  toolValidateCoupon: jest.Mock;
  toolToggleTheme: jest.Mock;
  toolGetSettings: jest.Mock;
  toolGetAnalytics: jest.Mock;
  toolGetProductDetails: jest.Mock;
  toolListSubscriptions: jest.Mock;
  toolGetAffiliateConfig: jest.Mock;
  toolBrowseMarketplace: jest.Mock;
};

const makeStubDeps = (): { stub: Stub; deps: WorkspaceInfoToolDeps } => {
  const stub: Stub = {
    toolListFlows: jest.fn().mockResolvedValue({ success: true, flows: [] }),
    toolGetDashboardSummary: jest.fn().mockResolvedValue({ success: true, summary: {} }),
    toolGetProductPlans: jest.fn().mockResolvedValue({ success: true, plans: [] }),
    toolGetProductAiConfig: jest.fn().mockResolvedValue({ success: true, aiConfig: {} }),
    toolGetProductReviews: jest.fn().mockResolvedValue({ success: true, reviews: [] }),
    toolGetProductUrls: jest.fn().mockResolvedValue({ success: true, urls: [] }),
    toolValidateCoupon: jest.fn().mockResolvedValue({ success: true, valid: true }),
    toolToggleTheme: jest.fn().mockResolvedValue({ success: true, theme: 'dark' }),
    toolGetSettings: jest.fn().mockResolvedValue({ success: true, settings: {} }),
    toolGetAnalytics: jest.fn().mockResolvedValue({ success: true, analytics: {} }),
    toolGetProductDetails: jest.fn().mockResolvedValue({ success: true, product: {} }),
    toolListSubscriptions: jest.fn().mockResolvedValue({ success: true, subscriptions: [] }),
    toolGetAffiliateConfig: jest.fn().mockResolvedValue({ success: true, config: {} }),
    toolBrowseMarketplace: jest.fn().mockResolvedValue({ success: true, items: [] }),
  };
  const deps: WorkspaceInfoToolDeps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chatToolsService: stub as any,
  };
  return { stub, deps };
};

describe('kloel-tool-dispatcher.workspace-info.handlers', () => {
  describe('isWorkspaceInfoTool', () => {
    it('recognises every info-tool name', () => {
      for (const name of WORKSPACE_INFO_TOOL_NAMES) {
        expect(isWorkspaceInfoTool(name)).toBe(true);
      }
    });

    it('returns false for action / unrelated tools', () => {
      expect(isWorkspaceInfoTool('toggle_autopilot')).toBe(false);
      expect(isWorkspaceInfoTool('create_payment_link')).toBe(false);
      expect(isWorkspaceInfoTool('foo')).toBe(false);
    });
  });

  describe('dispatchWorkspaceInfoTool', () => {
    it('returns null for unrelated tool names', async () => {
      const { deps } = makeStubDeps();
      expect(await dispatchWorkspaceInfoTool(deps, 'ws1', 'unrelated', {})).toBeNull();
    });

    it('delegates list_flows / get_settings / get_affiliate_config with workspace only', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'list_flows', {});
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_settings', {});
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_affiliate_config', {});
      expect(stub.toolListFlows).toHaveBeenCalledWith('ws1');
      expect(stub.toolGetSettings).toHaveBeenCalledWith('ws1');
      expect(stub.toolGetAffiliateConfig).toHaveBeenCalledWith('ws1');
    });

    it('delegates args-bearing info tools verbatim', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_dashboard_summary', { period: 'week' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_product_plans', { productId: 'p1' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_product_ai_config', { productId: 'p1' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_product_reviews', { productId: 'p1' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_product_urls', { productId: 'p1' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'validate_coupon', { code: 'X10' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'toggle_theme', { theme: 'dark' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_analytics', { range: '30d' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'get_product_details', { productId: 'p1' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'list_subscriptions', { status: 'active' });
      await dispatchWorkspaceInfoTool(deps, 'ws1', 'browse_marketplace', { q: 'whatsapp' });

      expect(stub.toolGetDashboardSummary).toHaveBeenCalledWith('ws1', { period: 'week' });
      expect(stub.toolGetProductPlans).toHaveBeenCalledWith('ws1', { productId: 'p1' });
      expect(stub.toolGetProductAiConfig).toHaveBeenCalledWith('ws1', { productId: 'p1' });
      expect(stub.toolGetProductReviews).toHaveBeenCalledWith('ws1', { productId: 'p1' });
      expect(stub.toolGetProductUrls).toHaveBeenCalledWith('ws1', { productId: 'p1' });
      expect(stub.toolValidateCoupon).toHaveBeenCalledWith('ws1', { code: 'X10' });
      expect(stub.toolToggleTheme).toHaveBeenCalledWith('ws1', { theme: 'dark' });
      expect(stub.toolGetAnalytics).toHaveBeenCalledWith('ws1', { range: '30d' });
      expect(stub.toolGetProductDetails).toHaveBeenCalledWith('ws1', { productId: 'p1' });
      expect(stub.toolListSubscriptions).toHaveBeenCalledWith('ws1', { status: 'active' });
      expect(stub.toolBrowseMarketplace).toHaveBeenCalledWith('ws1', { q: 'whatsapp' });
    });

    it('update_subscription returns "cancelada" message for cancel action', async () => {
      const { deps } = makeStubDeps();
      const result = await dispatchWorkspaceInfoTool(deps, 'ws1', 'update_subscription', {
        action: 'cancel',
      });
      expect(result).toEqual({ success: true, message: 'Assinatura cancelada.' });
    });

    it('update_subscription returns "pausada" message for any other action', async () => {
      const { deps } = makeStubDeps();
      const result = await dispatchWorkspaceInfoTool(deps, 'ws1', 'update_subscription', {
        action: 'pause',
      });
      expect(result).toEqual({ success: true, message: 'Assinatura pausada.' });
    });

    it('update_subscription handles missing action key (-> "pausada")', async () => {
      const { deps } = makeStubDeps();
      const result = await dispatchWorkspaceInfoTool(deps, 'ws1', 'update_subscription', {});
      expect(result).toEqual({ success: true, message: 'Assinatura pausada.' });
    });
  });
});
