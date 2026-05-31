/**
 * Route-metadata boot-smoke for FacebookMessengerController.
 *
 * Why this exists: when we extend the Messenger surface we want a fast
 * regression that proves the @Get / @Post decorators actually attached the
 * declared path + HTTP verb to each handler. A hand-rolled OpenAPI extract
 * (which other paridade audits also consume) parses the same Reflect metadata
 * NestJS reads at boot, so this spec catches:
 *   - a missing decorator (handler exists but isn't routable)
 *   - a typo in the path string
 *   - a verb mismatch (e.g. @Post on a read endpoint)
 *
 * It does NOT spin up NestApplication — that would pull the full DI graph
 * (Prisma, Stripe, Meta SDK, Bull) and is covered by `npm run start` /
 * `e2e`. The metadata-only check runs in well under one second and is enough
 * to confirm the controller's externally observable contract.
 */
import 'reflect-metadata';
import { FacebookMessengerController } from './facebook-messenger.controller';

// Nest @Get/@Post store the verb as a numeric enum (RequestMethod) on the
// handler function; we don't import the enum to avoid a Nest runtime
// dependency in this spec — the comparison is via the well-known string name.
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

describe('FacebookMessengerController — route boot-smoke', () => {
  // RequestMethod enum from @nestjs/common (kept inline so the spec doesn't
  // pull a runtime import that the controller already exercises elsewhere).
  const GET = 0;
  const POST = 1;

  let routes: RouteInfo[];

  beforeAll(() => {
    routes = extractRoutes(FacebookMessengerController.prototype);
  });

  it('exposes the Messenger base path on the controller class', () => {
    const ReflectMeta = Reflect as unknown as {
      getMetadata(key: string, target: unknown): unknown;
    };
    const basePath = ReflectMeta.getMetadata('path', FacebookMessengerController);
    expect(basePath).toBe('marketing/facebook-messenger');
  });

  it.each([
    ['sendMessage', 'send', POST],
    ['getMessages', 'messages', GET],
    ['getConversations', 'conversations', GET],
    ['getStatus', 'status', GET],
    ['getSummary', 'summary', GET],
    ['getContacts', 'contacts', GET],
  ])('routes handler %s to %s %s', (handler, expectedPath, expectedMethod) => {
    const route = routes.find((r) => r.handler === handler);
    expect(route).toBeDefined();
    expect(route?.path).toBe(expectedPath);
    expect(route?.method).toBe(expectedMethod);
  });

  it('preserves all 6 declared routes', () => {
    expect(routes).toHaveLength(6);
  });
});
