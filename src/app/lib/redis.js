import Redis from 'ioredis';

let redisClient;

export function getRedisClient() {
  if (redisClient !== undefined) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('REDIS_URL is not set; Redis caching is disabled.');
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
  });

  return redisClient;
}
