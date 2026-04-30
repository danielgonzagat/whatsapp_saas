import * as os from 'node:os';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { forEachSequential } from '../common/async-sequence';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { SystemHealthService } from '../health/system-health.service';
import { PulseArtifactService } from './pulse-artifact.service';
import { PulseFrontendHeartbeatDto } from './dto/frontend-heartbeat.dto';
import { PulseInternalHeartbeatDto } from './dto/internal-heartbeat.dto';
import {
  CRITICAL_REGISTRY_REDIS_SLOT,
  DEFAULT_BACKEND_TTL_MS,
  DEFAULT_FRONTEND_PRUNE_SWEEP_MS,
  DEFAULT_FRONTEND_TTL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_STALE_SWEEP_MS,
  DEFAULT_WORKER_TTL_MS,
  FRONTEND_REGISTRY_REDIS_SLOT,
  FRONTEND_RETENTION_MS,
  INCIDENTS_REDIS_SLOT,
  INCIDENT_LIMIT,
  REGISTRY_REDIS_SLOT,
  type PulseHeartbeatRecord,
  type PulseIncident,
  type PulseOrganismNode,
  type PulseOrganismRole,
  type PulseOrganismStatus,
} from './pulse.service.contract';
import {
  buildOrganismAdvice,
  compactText,
  safeJsonParse,
  toOrganismStatus,
} from './pulse.service.utils';
import "../../../scripts/pulse/__companions__/pulse.service.companion";
