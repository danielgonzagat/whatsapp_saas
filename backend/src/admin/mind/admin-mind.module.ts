import { Module } from '@nestjs/common';
import { KloelModule } from '../../kloel/kloel.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminMindController } from './admin-mind.controller';
import { AdminMindService } from './admin-mind.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, KloelModule],
  controllers: [AdminMindController],
  providers: [AdminMindService],
  exports: [AdminMindService],
})
export class AdminMindModule {}
