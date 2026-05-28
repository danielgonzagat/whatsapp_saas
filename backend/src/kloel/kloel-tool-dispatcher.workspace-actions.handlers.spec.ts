import {
  dispatchWorkspaceActionTool,
  isWorkspaceActionTool,
  WORKSPACE_ACTION_TOOL_NAMES,
} from './kloel-tool-dispatcher.workspace-actions.handlers';
import type { WorkspaceActionToolDeps } from './kloel-tool-dispatcher.workspace-actions.handlers';

type Stub = {
  chatToolsService: {
    toolToggleAutopilot: jest.Mock;
    toolSetBrandVoice: jest.Mock;
    toolSetSalesPolicy: jest.Mock;
    toolRememberUserInfo: jest.Mock;
    toolCreateFlow: jest.Mock;
    toolSendChannelMessage: jest.Mock;
    toolCreateBroadcast: jest.Mock;
    toolConfigureAiPersona: jest.Mock;
    toolCreateOrder: jest.Mock;
  };
  applyReceipt: jest.Mock;
};

const DEFAULT_USER_ID = 'u1';

const makeStubDeps = (
  userId: string | undefined = DEFAULT_USER_ID,
  explicitUndefined = false,
): { stub: Stub; deps: WorkspaceActionToolDeps } => {
  const stub: Stub = {
    chatToolsService: {
      toolToggleAutopilot: jest.fn().mockResolvedValue({ success: true, enabled: true }),
      toolSetBrandVoice: jest.fn().mockResolvedValue({ success: true }),
      toolSetSalesPolicy: jest.fn().mockResolvedValue({ success: true }),
      toolRememberUserInfo: jest.fn().mockResolvedValue({ success: true }),
      toolCreateFlow: jest.fn().mockResolvedValue({ success: true, flow: { id: 'f1' } }),
      toolSendChannelMessage: jest.fn().mockResolvedValue({ success: true, sent: 1 }),
      toolCreateBroadcast: jest.fn().mockResolvedValue({ success: true, broadcast: { id: 'b1' } }),
      toolConfigureAiPersona: jest.fn().mockResolvedValue({ success: true }),
      toolCreateOrder: jest.fn().mockResolvedValue({ success: true, order: { id: 'o1' } }),
    },
    applyReceipt: jest.fn().mockImplementation((cap, _ws, _a, result) => ({
      ...result,
      capabilityId: cap,
      wrapped: true,
    })),
  };
  const deps: WorkspaceActionToolDeps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chatToolsService: stub.chatToolsService as any,
    applyReceipt: stub.applyReceipt,
    userId: explicitUndefined ? undefined : userId,
  };
  return { stub, deps };
};

describe('kloel-tool-dispatcher.workspace-actions.handlers', () => {
  describe('isWorkspaceActionTool', () => {
    it('recognises every action tool name', () => {
      for (const name of WORKSPACE_ACTION_TOOL_NAMES) {
        expect(isWorkspaceActionTool(name)).toBe(true);
      }
    });

    it('returns false for unrelated tools', () => {
      expect(isWorkspaceActionTool('toggle_theme')).toBe(false);
      expect(isWorkspaceActionTool('list_flows')).toBe(false);
    });
  });

  describe('dispatchWorkspaceActionTool', () => {
    it('returns null for unrelated tool names', async () => {
      const { deps } = makeStubDeps();
      expect(await dispatchWorkspaceActionTool(deps, 'ws1', 'unrelated', {})).toBeNull();
    });

    it('toggle_autopilot wraps result with canonical receipt', async () => {
      const { stub, deps } = makeStubDeps();
      const result = await dispatchWorkspaceActionTool(deps, 'ws1', 'toggle_autopilot', {
        enabled: true,
      });
      expect(stub.chatToolsService.toolToggleAutopilot).toHaveBeenCalledWith('ws1', {
        enabled: true,
      });
      expect(stub.applyReceipt).toHaveBeenCalledWith(
        'toggle_autopilot',
        'ws1',
        { enabled: true },
        { success: true, enabled: true },
        'u1',
        expect.any(Number),
      );
      expect(result?.wrapped).toBe(true);
      expect(result?.capabilityId).toBe('toggle_autopilot');
    });

    it('set_brand_voice enriches successful result with tone from args', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'set_brand_voice', { tone: 'friendly' });
      const wrappedResult = stub.applyReceipt.mock.calls[0]?.[3] as {
        success: boolean;
        tone?: string;
      };
      expect(wrappedResult).toEqual({ success: true, tone: 'friendly' });
    });

    it('set_brand_voice does NOT enrich tone when result.success is false', async () => {
      const { stub, deps } = makeStubDeps();
      stub.chatToolsService.toolSetBrandVoice.mockResolvedValueOnce({
        success: false,
        error: 'boom',
      });
      await dispatchWorkspaceActionTool(deps, 'ws1', 'set_brand_voice', { tone: 'friendly' });
      const wrappedResult = stub.applyReceipt.mock.calls[0]?.[3];
      expect(wrappedResult).toEqual({ success: false, error: 'boom' });
    });

    it('set_brand_voice tone defaults to empty string when args.tone missing', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'set_brand_voice', {});
      const wrappedResult = stub.applyReceipt.mock.calls[0]?.[3] as {
        success: boolean;
        tone?: string;
      };
      expect(wrappedResult.tone).toBe('');
    });

    it('set_sales_policy passes userId through to chat tools and wraps receipt', async () => {
      const { stub, deps } = makeStubDeps('admin');
      await dispatchWorkspaceActionTool(deps, 'ws1', 'set_sales_policy', { policy: 'strict' });
      expect(stub.chatToolsService.toolSetSalesPolicy).toHaveBeenCalledWith(
        'ws1',
        { policy: 'strict' },
        'admin',
      );
      expect(stub.applyReceipt).toHaveBeenCalledWith(
        'set_sales_policy',
        'ws1',
        { policy: 'strict' },
        { success: true },
        'admin',
        expect.any(Number),
      );
    });

    it('remember_user_info enriches success result with key/value', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'remember_user_info', {
        key: 'preferred_channel',
        value: 'whatsapp',
      });
      const wrappedResult = stub.applyReceipt.mock.calls[0]?.[3];
      expect(wrappedResult).toEqual({
        success: true,
        key: 'preferred_channel',
        value: 'whatsapp',
      });
    });

    it('remember_user_info does NOT enrich when result.success is false', async () => {
      const { stub, deps } = makeStubDeps();
      stub.chatToolsService.toolRememberUserInfo.mockResolvedValueOnce({
        success: false,
        error: 'fail',
      });
      await dispatchWorkspaceActionTool(deps, 'ws1', 'remember_user_info', {
        key: 'k',
        value: 'v',
      });
      const wrappedResult = stub.applyReceipt.mock.calls[0]?.[3];
      expect(wrappedResult).toEqual({ success: false, error: 'fail' });
    });

    it('create_flow wraps result with create_flow capability', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'create_flow', { name: 'f1' });
      expect(stub.chatToolsService.toolCreateFlow).toHaveBeenCalledWith('ws1', { name: 'f1' });
      expect(stub.applyReceipt.mock.calls[0]?.[0]).toBe('create_flow');
    });

    it('send_channel_message delegates without receipt (no applyReceipt call)', async () => {
      const { stub, deps } = makeStubDeps();
      const result = await dispatchWorkspaceActionTool(deps, 'ws1', 'send_channel_message', {
        channel: 'whatsapp',
        text: 'hi',
      });
      expect(stub.chatToolsService.toolSendChannelMessage).toHaveBeenCalledWith('ws1', {
        channel: 'whatsapp',
        text: 'hi',
      });
      expect(stub.applyReceipt).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, sent: 1 });
    });

    it('create_broadcast wraps result with create_broadcast capability', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'create_broadcast', { name: 'b1' });
      expect(stub.applyReceipt.mock.calls[0]?.[0]).toBe('create_broadcast');
    });

    it('configure_ai_persona wraps result with configure_ai_persona capability', async () => {
      const { stub, deps } = makeStubDeps();
      await dispatchWorkspaceActionTool(deps, 'ws1', 'configure_ai_persona', { persona: 'sales' });
      expect(stub.applyReceipt.mock.calls[0]?.[0]).toBe('configure_ai_persona');
    });

    it('create_order delegates without receipt (no applyReceipt call)', async () => {
      const { stub, deps } = makeStubDeps();
      const result = await dispatchWorkspaceActionTool(deps, 'ws1', 'create_order', {
        productId: 'p1',
      });
      expect(stub.chatToolsService.toolCreateOrder).toHaveBeenCalledWith('ws1', {
        productId: 'p1',
      });
      expect(stub.applyReceipt).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, order: { id: 'o1' } });
    });

    it('passes undefined userId through to receipt when dispatcher has no user', async () => {
      const { stub, deps } = makeStubDeps(undefined, true);
      await dispatchWorkspaceActionTool(deps, 'ws1', 'toggle_autopilot', {});
      expect(stub.applyReceipt).toHaveBeenCalledWith(
        'toggle_autopilot',
        'ws1',
        {},
        expect.any(Object),
        undefined,
        expect.any(Number),
      );
    });
  });
});
