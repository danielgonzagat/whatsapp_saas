import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Prisma module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
