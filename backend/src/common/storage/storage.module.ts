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
export class StorageModule {}
