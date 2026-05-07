import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that bypasses rate-limiting when the runtime is unmistakably
 * a non-production test harness (Jest unit tests, Playwright e2e CI, or an
 * explicit opt-in via `E2E_TEST_MODE=true`). Production behavior is unchanged.
 *
 * Why: the e2e CI job exercises auth flows in tight loops which trip the
 * 5-req/min throttle on `/auth/login` and `/auth/register`, causing the
 * Playwright harness to fail with 429s on legitimate test setup. Test mode
 * is detected from environment signals that only the harness can produce.
 */
@Injectable()
export class TestModeThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') return Promise.resolve(false);
    if (process.env.JEST_WORKER_ID) return Promise.resolve(true);
    if (process.env.NODE_ENV === 'test') return Promise.resolve(true);
    if (process.env.E2E_TEST_MODE === 'true') return Promise.resolve(true);
    if (process.env.OPENAI_API_KEY === 'e2e-dummy-key') return Promise.resolve(true);
    return Promise.resolve(false);
  }
}
