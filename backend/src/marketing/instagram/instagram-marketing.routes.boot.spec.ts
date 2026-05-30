/**
 * Route-metadata boot-smoke for InstagramMarketingController.
 *
 * Why this exists: when we extend the Instagram marketing surface (adding the
 * messaging trio — send / conversations / messages — for paridade with
 * WhatsApp and Facebook Messenger) we want a fast regression that proves the
 * `@Get` / `@Post` decorators actually attached the declared path + HTTP verb
 * to each handler. NestJS reads the exact same Reflect metadata at boot, so
 * this spec catches:
 *   - a missing decorator (handler exists but isn't routable),
 *   - a typo in the path string,
 *   - a verb mismatch (e.g. `@Post` on a read endpoint).
 *
 * It does NOT spin up a NestApplication — that would pull the full DI graph
 * (Prisma, Stripe, Meta SDK, Bull) and is covered by `npm run start` / e2e.
 * The metadata-only check runs in well under one second and is enough to
 * confirm the controller's externally observable contract.
 */
import 'reflect-metadata';
import { InstagramMarketingController } from './instagram-marketing.controller';

type RouteHandler = (...args: unknown[]) => unknown;

interface RouteInfo {
  handler: string;
  path: string;
  method: number;
}

function extractRoutes(controller: object): RouteInfo[] {
  const proto = controller as unknown as Record<string, unknown>;
  const handlerNames = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor' && typeof proto[name] === 'function',
  );

  const ReflectMeta = Reflect as unknown as {
    getMetadata(key: string, target: unknown): unknown;
  };

  const routes: RouteInfo[] = [];
  for (const name of handlerNames) {
    const fn = proto[name] as RouteHandler;
    const path = ReflectMeta.getMetadata('path', fn);
    const method = ReflectMeta.getMetadata('method', fn);
    if (typeof path === 'string' && typeof method === 'number') {
      routes.push({ handler: name, path, method });
    }
  }
  return routes;
}

describe('InstagramMarketingController — route boot-smoke', () => {
  // RequestMethod enum values from @nestjs/common (inlined to avoid pulling a
  // runtime import the controller already exercises elsewhere).
  const GET = 0;
  const POST = 1;

  let routes: RouteInfo[];

  beforeAll(() => {
    routes = extractRoutes(InstagramMarketingController.prototype);
  });

  it('exposes the Instagram marketing base path on the controller class', () => {
    const ReflectMeta = Reflect as unknown as {
      getMetadata(key: string, target: unknown): unknown;
    };
    const basePath = ReflectMeta.getMetadata('path', InstagramMarketingController);
    expect(basePath).toBe('marketing/instagram');
  });

  it.each([
    ['listAccounts', 'accounts', GET],
    ['publishPost', 'posts', POST],
    ['listPosts', 'posts', GET],
    ['getInsights', 'insights', GET],
    ['listInsights', 'insights/history', GET],
    // The 3 new messaging routes shipped for WhatsApp/Facebook paridade.
    ['sendDirectMessage', 'send', POST],
    ['listConversations', 'conversations', GET],
    ['listMessages', 'messages', GET],
  ])('routes handler %s to %s %s', (handler, expectedPath, expectedMethod) => {
    const route = routes.find((r) => r.handler === handler);
    expect(route).toBeDefined();
    expect(route?.path).toBe(expectedPath);
    expect(route?.method).toBe(expectedMethod);
  });

  it('preserves all 8 declared routes', () => {
    expect(routes).toHaveLength(8);
  });
});
