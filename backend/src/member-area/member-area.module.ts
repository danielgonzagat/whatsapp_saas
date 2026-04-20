import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberAreaController } from './member-area.controller';

/** Member area module. */
@Module({
  imports: [PrismaModule],
  controllers: [MemberAreaController],
})
export class MemberAreaModule {}
