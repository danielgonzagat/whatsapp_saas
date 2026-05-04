import { HealthCheckError } from '@nestjs/terminus';
import { StripeHealthIndicator } from './stripe.health-indicator';

describe('StripeHealthIndicator', () => {
  let indicator: StripeHealthIndicator;
  let stripeService: { retrieveBalance: jest.Mock };

  beforeEach(() => {
    stripeService = {
      retrieveBalance: jest.fn(),
    };
    indicator = new StripeHealthIndicator(stripeService as never);
  });

  it('returns healthy when retrieveBalance succeeds', async () => {
    stripeService.retrieveBalance.mockResolvedValue({
      livemode: false,
      pending: ['p1'],
      available: ['a1', 'a2'],
    });

    const result = await indicator.isHealthy('stripe');

    expect(result.stripe.status).toBe('up');
    expect(result.stripe.mode).toBe('test');
    expect(result.stripe.pendingAmount).toBe(1);
    expect(result.stripe.availableAmount).toBe(2);
    expect(typeof result.stripe.checkDurationMs).toBe('number');
  });

  it('returns unhealthy with HealthCheckError when Stripe SDK throws', async () => {
    stripeService.retrieveBalance.mockRejectedValue(new Error('stripe down'));

    await expect(indicator.isHealthy('stripe')).rejects.toThrow(HealthCheckError);
  });

  it('retries failed Stripe calls up to max attempts before failing', async () => {
    stripeService.retrieveBalance.mockRejectedValue(new Error('network'));

    await expect(indicator.isHealthy('stripe')).rejects.toThrow(HealthCheckError);
    expect(stripeService.retrieveBalance).toHaveBeenCalledTimes(3);
  });
});
