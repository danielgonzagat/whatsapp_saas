import { Module } from '@nestjs/common';
import { MemberAreaController } from './member-area.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MemberAreaController],
})
export class MemberAreaModule {}
