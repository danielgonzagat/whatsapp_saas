import { AdminAction, AdminModule } from '@prisma/client';
import { ChatToolRegistry, type ChatTool } from './chat-tool.registry';

function stubTool(name: string, kind: ChatTool['kind'] = 'read'): ChatTool {
  return {
    name,
    kind,
    description: `stub ${name}`,
    permissionModule: AdminModule.CONTAS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object' },
    execute: async () => ({ ok: true }),
  };
}

describe('ChatToolRegistry', () => {
  it('registers and resolves by name', () => {
    const r = new ChatToolRegistry();
    const t = stubTool('searchWorkspaces');
    r.register(t);
    expect(r.resolve('searchWorkspaces')).toBe(t);
    expect(r.resolve('doesNotExist')).toBeNull();
  });

  it('rejects duplicate registration for the same name', () => {
    const r = new ChatToolRegistry();
    r.register(stubTool('dupe'));
    expect(() => r.register(stubTool('dupe'))).toThrow(/already registered/);
  });

  it('listAll() returns tools sorted alphabetically', () => {
    const r = new ChatToolRegistry();
    r.register(stubTool('zeta'));
    r.register(stubTool('alpha'));
    r.register(stubTool('mid'));
    expect(r.listAll().map((t) => t.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('preserves the kind field on every tool', () => {
    const r = new ChatToolRegistry();
    r.register(stubTool('readOne', 'read'));
    r.register(stubTool('intentOne', 'intent'));
    expect(r.resolve('readOne')?.kind).toBe('read');
    expect(r.resolve('intentOne')?.kind).toBe('intent');
  });
});
