import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberAreaController } from './member-area.controller';
import { MemberAreaPublicController } from './member-area-public.controller';

/** Member area module. */
@Module({
  imports: [PrismaModule],
  controllers: [MemberAreaController, MemberAreaPublicController],
})
export class MemberAreaModule {}
