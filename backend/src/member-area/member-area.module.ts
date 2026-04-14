import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberAreaController } from './member-area.controller';

@Module({
  imports: [PrismaModule],
  controllers: [MemberAreaController],
})
export class MemberAreaModule {}
