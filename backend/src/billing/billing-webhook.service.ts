import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { FinancialAlertService } from '../common/financial-alert.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { activatePlanFeatures } from './billing-plan-features';
import {
  mapStripeStatus,
  notifyCustomerPaymentConfirmedHelper,
  notifyOpsHelper,
  readInvoiceSubscriptionId,
} from './billing-webhook.helpers';
import { StripeRuntime } from './stripe-runtime';
import type {
  StripeCheckoutSession,
  StripeClient,
  StripeEvent,
  StripeSubscription,
} from './stripe-types';
import type { StripeSubscriptionWithPeriodEnd, WhatsappNotifier } from './billing-webhook.types';
