export function getSocketAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configuredOrigins = env.CORS_ALLOWED_ORIGINS || env.ALLOWED_ORIGINS;
  const origins = configuredOrigins
    ? configuredOrigins.split(',')
    : [
        env.FRONTEND_URL,
        'http://localhost:3000',
        'http://localhost:3005',
        'http://127.0.0.1:3000',
        'http://root.localhost:3000',
        'http://app.root.localhost:3000',
        'http://auth.root.localhost:3000',
        'http://pay.root.localhost:3000',
      ];

  return Array.from(
    new Set(
      origins.map((origin) => origin?.trim()).filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

export function isSocketOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) {
    return true;
  }

  if (env.NODE_ENV !== 'production') {
    return true;
  }

  return getSocketAllowedOrigins(env).includes(origin);
}

export const SOCKET_CORS_OPTIONS = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    callback(null, isSocketOriginAllowed(origin));
  },
  credentials: true,
};
