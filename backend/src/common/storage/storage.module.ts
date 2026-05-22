import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageDriversService } from './storage-drivers.service';
import { StorageService } from './storage.service';

/** Storage module. */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [StorageService, StorageDriversService],
  exports: [StorageService, StorageDriversService],
})
/**
 * @cluster whatsapp_saas/backend/common
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class StorageModule {}
