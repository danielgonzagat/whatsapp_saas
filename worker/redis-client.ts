import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Cliente para comandos gerais
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Cliente para Pub/Sub (Subscriber precisa de conexão exclusiva)
export const redisSub = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Cliente para Pub/Sub (Publisher)
export const redisPub = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
