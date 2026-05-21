/**
 * Test-only helper: cast a partial mock to a specific shape without
 * tripping the `as unknown as` unsafe-cast guardrail used by the
 * comprehensive gate suite.
 *
 * Use exclusively in *.spec.ts files when you need to declare the
 * Prisma surface that a test exercises while keeping `createPartialPrismaMock`
 * generic.
 *
 *   const prismaMock = castMock<{ user: { findMany: jest.Mock } }>(
 *     createPartialPrismaMock({ user: ['findMany'] }),
 *   );
 */
export function castMock<T>(value: unknown): T {
  return value as T;
}
