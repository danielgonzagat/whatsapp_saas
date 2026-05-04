jest.mock('dd-trace', () => {
  const dogstatsd = {
    increment: jest.fn(),
    histogram: jest.fn(),
    gauge: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      dogstatsd,
    },
    dogstatsd,
  };
});

import tracer from 'dd-trace';
import { increment, histogram, gauge, Metrics } from './metrics';

type MockedDogStatsD = {
  increment: jest.Mock;
  histogram: jest.Mock;
  gauge: jest.Mock;
};

describe('metrics', () => {
  let ds: MockedDogStatsD;

  beforeEach(() => {
    ds = tracer.dogstatsd as unknown as MockedDogStatsD;
    jest.clearAllMocks();
  });

  describe('increment', () => {
    it('calls dogstatsd.increment with kloel prefix', () => {
      increment('api.request');

      expect(ds.increment).toHaveBeenCalledWith('kloel.api.request', 1, expect.anything());
    });

    it('merges extra tags with base tags', () => {
      increment('api.request', { route: '/users' });

      expect(ds.increment).toHaveBeenCalledWith(
        'kloel.api.request',
        1,
        expect.arrayContaining(['route:/users']),
      );
    });
  });

  describe('histogram', () => {
    it('calls dogstatsd.histogram with kloel prefix', () => {
      histogram('api.request_latency_ms', 42.5);

      expect(ds.histogram).toHaveBeenCalledWith(
        'kloel.api.request_latency_ms',
        42.5,
        expect.anything(),
      );
    });

    it('includes extra tags', () => {
      histogram('api.request_latency_ms', 100, { route: '/orders' });

      expect(ds.histogram).toHaveBeenCalledWith(
        'kloel.api.request_latency_ms',
        100,
        expect.arrayContaining(['route:/orders']),
      );
    });
  });

  describe('gauge', () => {
    it('calls dogstatsd.gauge with kloel prefix', () => {
      gauge('queue.depth', 5, { queue: 'autopilot' });

      expect(ds.gauge).toHaveBeenCalledWith(
        'kloel.queue.depth',
        5,
        expect.arrayContaining(['queue:autopilot']),
      );
    });
  });

  describe('Metrics namespace', () => {
    describe('checkout', () => {
      it('started increments checkout.started counter', () => {
        Metrics.checkout.started({ plan: 'pro' });

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.checkout.started',
          1,
          expect.arrayContaining(['plan:pro']),
        );
      });

      it('completed increments checkout.completed counter', () => {
        Metrics.checkout.completed();

        expect(ds.increment).toHaveBeenCalledWith('kloel.checkout.completed', 1, expect.anything());
      });

      it('duration records histogram in ms', () => {
        Metrics.checkout.duration(320);

        expect(ds.histogram).toHaveBeenCalledWith(
          'kloel.checkout.duration_ms',
          320,
          expect.anything(),
        );
      });
    });

    describe('payment', () => {
      it('processed increments with payment_method tag', () => {
        Metrics.payment.processed('stripe', { country: 'br' });

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.payment.processed',
          1,
          expect.arrayContaining(['payment_method:stripe', 'country:br']),
        );
      });

      it('latency records histogram with payment_method tag', () => {
        Metrics.payment.latency(150, 'mercadopago');

        expect(ds.histogram).toHaveBeenCalledWith(
          'kloel.payment.latency_ms',
          150,
          expect.arrayContaining(['payment_method:mercadopago']),
        );
      });
    });

    describe('whatsapp', () => {
      it('messageReceived increments counter', () => {
        Metrics.whatsapp.messageReceived({ direction: 'inbound' });

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.whatsapp.message_received',
          1,
          expect.arrayContaining(['direction:inbound']),
        );
      });

      it('messageSent increments counter', () => {
        Metrics.whatsapp.messageSent();

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.whatsapp.message_sent',
          1,
          expect.anything(),
        );
      });

      it('sessionConnected increments with workspace_id', () => {
        Metrics.whatsapp.sessionConnected('ws-abc');

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.whatsapp.session_connected',
          1,
          expect.arrayContaining(['workspace_id:ws-abc']),
        );
      });

      it('sessionDisconnected increments with workspace_id', () => {
        Metrics.whatsapp.sessionDisconnected('ws-xyz');

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.whatsapp.session_disconnected',
          1,
          expect.arrayContaining(['workspace_id:ws-xyz']),
        );
      });
    });

    describe('api', () => {
      it('request increments counter and records histogram', () => {
        Metrics.api.request('/contacts', 200, 45);

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.api.request',
          1,
          expect.arrayContaining(['route:/contacts', 'status:200']),
        );
        expect(ds.histogram).toHaveBeenCalledWith(
          'kloel.api.request_latency_ms',
          45,
          expect.arrayContaining(['route:/contacts']),
        );
      });
    });

    describe('auth', () => {
      it('loginSuccess increments with provider tag', () => {
        Metrics.auth.loginSuccess('google');

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.auth.login_success',
          1,
          expect.arrayContaining(['provider:google']),
        );
      });

      it('loginFailed increments with reason tag', () => {
        Metrics.auth.loginFailed('invalid_credentials', { provider: 'email' });

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.auth.login_failed',
          1,
          expect.arrayContaining(['reason:invalid_credentials', 'provider:email']),
        );
      });
    });

    describe('queue', () => {
      it('enqueued increments with queue tag', () => {
        Metrics.queue.enqueued('autopilot');

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.queue.enqueued',
          1,
          expect.arrayContaining(['queue:autopilot']),
        );
      });

      it('processed increments with queue tag', () => {
        Metrics.queue.processed('flow', { priority: 'high' });

        expect(ds.increment).toHaveBeenCalledWith(
          'kloel.queue.processed',
          1,
          expect.arrayContaining(['queue:flow', 'priority:high']),
        );
      });

      it('depth sets gauge value', () => {
        Metrics.queue.depth('autopilot', 12);

        expect(ds.gauge).toHaveBeenCalledWith(
          'kloel.queue.depth',
          12,
          expect.arrayContaining(['queue:autopilot']),
        );
      });
    });
  });
});
