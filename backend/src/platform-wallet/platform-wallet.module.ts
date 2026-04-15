import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformWalletService } from './platform-wallet.service';

/**
 * Thin wrapper module that exposes PlatformWalletService to both
 * admin and domain consumers without pulling in the full admin
 * module tree. The checkout confirmation flow imports this to
 * append platform fee credits inside the same $transaction that
 * marks the order as PAID (SP-9 split engine).
 */
@Module({
  imports: [PrismaModule],
  providers: [PlatformWalletService],
  exports: [PlatformWalletService],
})
export class PlatformWalletModule {}
