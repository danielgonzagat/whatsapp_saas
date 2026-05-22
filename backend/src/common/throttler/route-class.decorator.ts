import { SetMetadata } from '@nestjs/common';
import { RouteClassKey } from './throttler-config';

export const ROUTE_CLASS_METADATA_KEY = 'routeClass';

/**
 * Assign a rate-limit bucket to a controller class.
 *
 * Must match one of the keys defined in {@link ROUTE_CLASS_LIMITS}.
 * Applied at the class level; individual handlers that deviate from the
 * class default should use `@Throttle` with the corresponding named throttler.
 *
 * @example
 * ```ts
 * @Controller('auth')
 * @RouteClass('auth')
 * export class AuthController { ... }
 * ```
 */
export const RouteClass = (cls: RouteClassKey) => SetMetadata(ROUTE_CLASS_METADATA_KEY, cls);
