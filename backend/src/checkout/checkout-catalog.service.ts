import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutCatalogConfigService } from './checkout-catalog-config.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import {
  VALID_CHARGE_TYPES,
  VALID_DISCOUNT_TYPES,
  VALID_PIXEL_TYPES,
  validateCouponHelper,
} from './checkout-catalog.helpers';
import "../../../scripts/pulse/__companions__/checkout-catalog.service.companion";
