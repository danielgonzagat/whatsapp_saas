import { SplitController } from './split.controller';
import { SplitPreviewDto } from './dto/split-preview.dto';

// PULSE_OK: assertions exist below
describe('SplitController', () => {
  const controller = new SplitController();

  function validDto(): SplitPreviewDto {
    const dto = new SplitPreviewDto();
    dto.buyerPaidCents = '13990';
    dto.saleValueCents = '10000';
    dto.interestCents = '3990';
    dto.marketplaceFeeCents = '990';
    dto.supplier = {
      accountId: 'acct_supplier',
      amountCents: '4210',
    };
    dto.affiliate = {
      accountId: 'acct_affiliate',
      percentBp: 4000,
    };
    dto.seller = {
      accountId: 'acct_seller',
    };
    return dto;
  }

  it('valid split preview returns correct result', () => {
    const result = controller.preview('ws-1', validDto());

    expect(result.kloelTotalCents).toBe('4980');
    expect(result.splits).toEqual([
      { accountId: 'acct_supplier', role: 'supplier', amountCents: '4210' },
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: '3604' },
      { accountId: 'acct_seller', role: 'seller', amountCents: '1196' },
    ]);
    expect(result.residueCents).toBe('0');
  });

  it('correctly computes split with all roles', () => {
    const dto = new SplitPreviewDto();
    dto.buyerPaidCents = '10000';
    dto.saleValueCents = '10000';
    dto.interestCents = '0';
    dto.marketplaceFeeCents = '500';
    dto.affiliate = {
      accountId: 'acct_affiliate',
      percentBp: 1000,
    };
    dto.seller = {
      accountId: 'acct_seller',
    };

    const result = controller.preview('ws-1', dto);
    const kloel = result.kloelTotalCents;
    const totalSplits = result.splits.reduce((sum, line) => sum + BigInt(line.amountCents), 0n);
    const totalSum = BigInt(kloel) + totalSplits + BigInt(result.residueCents);
    expect(totalSum.toString()).toBe('10000');
  });

  it('supplier amount is capped at remaining when it exceeds available', () => {
    const dto = new SplitPreviewDto();
    dto.buyerPaidCents = '10000';
    dto.saleValueCents = '10000';
    dto.interestCents = '0';
    dto.marketplaceFeeCents = '500';
    dto.supplier = {
      accountId: 'acct_big_supplier',
      amountCents: '15000',
    };
    dto.seller = {
      accountId: 'acct_seller',
    };

    const result = controller.preview('ws-1', dto);

    expect(result.kloelTotalCents).toBe('500');
    const supplier = result.splits.find((s) => s.role === 'supplier');
    expect(supplier?.amountCents).toBe('9500');
    const seller = result.splits.find((s) => s.role === 'seller');
    expect(seller?.amountCents).toBe('0');
  });

  it('affiliate 100% with no supplier: seller gets 0', () => {
    const dto = new SplitPreviewDto();
    dto.buyerPaidCents = '13990';
    dto.saleValueCents = '10000';
    dto.interestCents = '3990';
    dto.marketplaceFeeCents = '990';
    dto.affiliate = {
      accountId: 'acct_affiliate',
      percentBp: 10_000,
    };
    dto.seller = {
      accountId: 'acct_seller',
    };

    const result = controller.preview('ws-1', dto);

    expect(result.splits).toEqual([
      { accountId: 'acct_affiliate', role: 'affiliate', amountCents: '9010' },
      { accountId: 'acct_seller', role: 'seller', amountCents: '0' },
    ]);
  });
});
