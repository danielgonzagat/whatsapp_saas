import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminDestructiveModule } from '../destructive/admin-destructive.module';
import { DestructiveIntentRegistry } from '../destructive/destructive-handler.registry';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import {
  ProductArchiveHandler,
  ProductDeleteHandler,
} from './handlers/product-destructive.handler';

/** Admin products module. */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule, AdminDestructiveModule],
  controllers: [AdminProductsController],
  providers: [AdminProductsService, ProductArchiveHandler, ProductDeleteHandler],
  exports: [AdminProductsService],
})
export class AdminProductsModule implements OnModuleInit {
  constructor(
    private readonly registry: DestructiveIntentRegistry,
    private readonly archiveHandler: ProductArchiveHandler,
    private readonly deleteHandler: ProductDeleteHandler,
  ) {}

  onModuleInit(): void {
    // Bootstrap SP-8 product handlers. DestructiveIntentService
    // becomes the single authorised execution point for
    // PRODUCT_ARCHIVE and PRODUCT_DELETE.
    this.registry.register(this.archiveHandler);
    this.registry.register(this.deleteHandler);
  }
}
