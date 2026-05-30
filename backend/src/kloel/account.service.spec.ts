import { AccountService } from './account.service';
import { castMock } from '../../test/helpers/cast-mock';

interface BankAccountCreateArgs {
  data: Record<string, unknown>;
}
interface BankAccountUpdateArgs {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

type TxMock = {
  bankAccount: {
    findFirst: jest.Mock;
    update: jest.Mock<Promise<unknown>, [BankAccountUpdateArgs]>;
    create: jest.Mock<Promise<unknown>, [BankAccountCreateArgs]>;
  };
};

describe('AccountService — payout DATA capabilities (updateBankAccount + setPixKey)', () => {
  let service: AccountService;
  let tx: TxMock;
  let prisma: { $transaction: jest.Mock };

  const lastCreate = (): BankAccountCreateArgs => {
    const calls = tx.bankAccount.create.mock.calls;
    return calls[calls.length - 1][0];
  };
  const lastUpdate = (): BankAccountUpdateArgs => {
    const calls = tx.bankAccount.update.mock.calls;
    return calls[calls.length - 1][0];
  };

  beforeEach(() => {
    tx = {
      bankAccount: {
        findFirst: jest.fn(),
        update: jest.fn((args: BankAccountUpdateArgs) =>
          Promise.resolve({ id: 'ba-existing', ...args.data }),
        ),
        create: jest.fn((args: BankAccountCreateArgs) =>
          Promise.resolve({ id: 'ba-new', ...args.data }),
        ),
      },
    };
    // Faithfully runs the callback against the tx mock and forwards options.
    prisma = {
      $transaction: jest.fn((cb: (t: TxMock) => unknown) => cb(tx)),
    };
    service = new AccountService(prisma as never);
  });

  describe('updateBankAccount', () => {
    it('rejects when no bank field is provided (honest error, no write)', async () => {
      const result = await service.updateBankAccount('ws-1', {});
      expect(result.success).toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.bankAccount.create).not.toHaveBeenCalled();
    });

    it('creates a default bank account when none exists', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      const result = await service.updateBankAccount('ws-1', {
        bankCode: '341',
        agency: '0001',
        account: '123456',
      });
      expect(result.success).toBe(true);
      expect(tx.bankAccount.create).toHaveBeenCalledTimes(1);
      expect(lastCreate().data).toMatchObject({
        workspaceId: 'ws-1',
        bankCode: '341',
        agency: '0001',
        account: '123456',
        isDefault: true,
        bankName: '341', // derived from bankCode when no explicit name supplied
        displayAccount: '****3456',
      });
    });

    it('updates the existing default account WITHOUT creating a duplicate (idempotent)', async () => {
      tx.bankAccount.findFirst.mockResolvedValue({ id: 'ba-existing' });
      const result = await service.updateBankAccount('ws-1', {
        bankCode: '237',
        agency: '1234',
        account: '987654',
      });
      expect(result.success).toBe(true);
      expect(tx.bankAccount.create).not.toHaveBeenCalled();
      expect(tx.bankAccount.update).toHaveBeenCalledTimes(1);
      const call = lastUpdate();
      expect(call.where).toEqual({ id: 'ba-existing', workspaceId: 'ws-1' });
      expect(call.data).toMatchObject({ bankCode: '237', agency: '1234', account: '987654' });
      // bankName is NOT clobbered on update when not supplied.
      expect(call.data).not.toHaveProperty('bankName');
    });

    it('replaying the same payload converges to update (no second create)', async () => {
      tx.bankAccount.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: 'ba-new' });
      const payload = { bankCode: '001', agency: '4242', account: '5555' };
      await service.updateBankAccount('ws-1', payload);
      await service.updateBankAccount('ws-1', payload);
      expect(tx.bankAccount.create).toHaveBeenCalledTimes(1);
      expect(tx.bankAccount.update).toHaveBeenCalledTimes(1);
    });

    it('uses a transaction with ReadCommitted isolation', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      await service.updateBankAccount('ws-1', { account: '1' });
      const [txCallback, txOptions] = castMock<[unknown, unknown]>(
        prisma.$transaction.mock.calls[0],
      );
      expect(typeof txCallback).toBe('function');
      expect(txOptions).toEqual(expect.objectContaining({ isolationLevel: 'ReadCommitted' }));
    });

    it('scopes findFirst by workspace + isDefault', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      await service.updateBankAccount('ws-9', { account: '1' });
      expect(tx.bankAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-9', isDefault: true } }),
      );
    });
  });

  describe('setPixKey', () => {
    it('rejects a missing pixKey (no write)', async () => {
      const result = await service.setPixKey('ws-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('pixKey');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid pixKeyType with an honest error', async () => {
      const result = await service.setPixKey('ws-1', {
        pixKey: 'a@b.com',
        pixKeyType: 'totally-bogus',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Tipo de chave PIX inválido');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('stores the PIX key, normalizing the type alias, on a fresh account', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      const result = await service.setPixKey('ws-1', {
        pixKey: 'user@kloel.com',
        pixKeyType: 'email',
      });
      expect(result.success).toBe(true);
      expect(lastCreate().data).toMatchObject({
        workspaceId: 'ws-1',
        pixKey: 'user@kloel.com',
        pixKeyType: 'EMAIL',
        isDefault: true,
        bankName: 'Banco', // no bankCode/name → safe non-null default
        displayAccount: '****.com',
      });
    });

    it('maps the PT-BR "celular" alias to PHONE', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      await service.setPixKey('ws-1', { pixKey: '+5511999999999', pixKeyType: 'celular' });
      expect(lastCreate().data.pixKeyType).toBe('PHONE');
    });

    it('updates the existing default account when present (idempotent, no duplicate)', async () => {
      tx.bankAccount.findFirst.mockResolvedValue({ id: 'ba-existing' });
      await service.setPixKey('ws-1', { pixKey: 'random-key-123', pixKeyType: 'aleatória' });
      expect(tx.bankAccount.create).not.toHaveBeenCalled();
      const call = lastUpdate();
      expect(call.where).toEqual({ id: 'ba-existing', workspaceId: 'ws-1' });
      expect(call.data).toMatchObject({ pixKey: 'random-key-123', pixKeyType: 'RANDOM' });
    });

    it('allows a pixKey with no explicit type (type omitted from write)', async () => {
      tx.bankAccount.findFirst.mockResolvedValue(null);
      const result = await service.setPixKey('ws-1', { pixKey: '12345678901' });
      expect(result.success).toBe(true);
      const data = lastCreate().data;
      expect(data.pixKey).toBe('12345678901');
      expect(data).not.toHaveProperty('pixKeyType');
    });
  });
});
