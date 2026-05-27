import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [EventEmitter2, ProductService],
  exports: [ProductService],
})
export class ProductsModule {}
