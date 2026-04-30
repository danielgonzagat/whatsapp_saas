import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, createSign, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getTraceHeaders } from '../common/trace-headers';
import { GoogleVerifiedProfile } from './google-auth.service';
import {
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  APPLE_ISSUER,
  APPLE_JWKS_URL,
  APPLE_TOKEN_URL,
  type AppleIdentityPayload,
  type AppleJwk,
  type AppleJwksResponse,
  type AppleJwtHeader,
  type AppleTokenResponse,
  type AppleUserHint,
  type AppleVerifiedToken,
  buildAppleName,
  decodeBase64UrlJson,
  normalizeEmailVerified,
  sanitizeAppleError,
  tokenAudienceIncludes,
} from './apple-auth.support';
