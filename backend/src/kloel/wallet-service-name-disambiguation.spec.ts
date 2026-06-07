import { SellerWalletService } from './wallet.service';
import { PrepaidWalletService } from '../wallet/wallet.service';

/**
 * P1 #7 regression guard — two distinct WalletService classes used to share the
 * SAME class name on DIFFERENT tables (seller Connect wallet vs prepaid
 * usage-metered wallet). Because NestJS provider tokens ARE the class symbols,
 * a bare `WalletService` import resolved to whichever file the import path
 * happened to point at — a silent wrong-import DI trap.
 *
 * Canonical names: SellerWalletService (kloel/wallet.service.ts) and
 * PrepaidWalletService (wallet/wallet.service.ts). This spec proves the two
 * symbols are now distinct, non-aliased classes so the collision can never
 * silently reappear.
 */
describe('WalletService name disambiguation (P1 #7 DI/import hazard)', () => {
  it('exports two distinct classes with canonical, non-colliding names', () => {
    expect(SellerWalletService).not.toBe(PrepaidWalletService);
    expect(SellerWalletService.name).toBe('SellerWalletService');
    expect(PrepaidWalletService.name).toBe('PrepaidWalletService');
    expect(SellerWalletService.name).not.toBe(PrepaidWalletService.name);
  });

  it('keeps the canonical-method surface on each wallet so DI tokens stay distinct', () => {
    // Seller (Connect) wallet: capability-resolver canonical aliases.
    expect(typeof SellerWalletService.prototype.getStatement).toBe('function');
    expect(typeof SellerWalletService.prototype.withdraw).toBe('function');
    expect(typeof SellerWalletService.prototype.anticipate).toBe('function');

    // Prepaid (usage-metered) wallet: top-up + usage-charge surface.
    expect(typeof PrepaidWalletService.prototype.createTopupIntent).toBe('function');
    expect(typeof PrepaidWalletService.prototype.chargeForUsage).toBe('function');

    // The seller wallet does NOT expose prepaid top-up — proving they are not
    // the same class accidentally re-exported under two names.
    const sellerProto = SellerWalletService.prototype as unknown as Record<string, unknown>;
    expect(sellerProto.createTopupIntent).toBeUndefined();
  });
});
