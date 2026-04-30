import * as crypto from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type Contact, type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { Public } from '../auth/public.decorator';
import { AutopilotService } from '../autopilot/autopilot.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WebhooksService } from './webhooks.service';
import {
  D_RE,
  type WebhookRequest,
  type GenericPaymentWebhookBody,
  type ShopifyOrderWebhookBody,
  type PagHiperWebhookBody,
  type WooCommerceMetaData,
  type WooCommerceWebhookBody,
} from './payment-webhook-types';
import {
  assertWorkspaceExists,
  verifySharedSecretOrSignature,
  ensureIdempotent,
  sendOpsAlert,
} from './payment-webhook-generic.helpers';
import "../../../scripts/pulse/__companions__/payment-webhook-generic.controller.companion";
