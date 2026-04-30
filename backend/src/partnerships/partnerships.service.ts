import { createHash, randomBytes } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import { generateUniquePublicCheckoutCode } from '../checkout/checkout-code.util';
import { buildPayCheckoutUrl } from '../checkout/checkout-public-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const INVITABLE_PARTNER_TYPES = new Set(['AFFILIATE', 'SUPPLIER', 'COPRODUCER', 'MANAGER']);
const PARTNER_ROLE_LABELS: Record<string, string> = {
  AFFILIATE: 'afiliado',
  SUPPLIER: 'fornecedor',
  COPRODUCER: 'coprodutor',
  MANAGER: 'gerente',
  PRODUCER: 'produtor',
};
